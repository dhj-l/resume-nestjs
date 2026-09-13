import {
  BadRequestException,
  Controller,
  Logger,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { type Express, type Request, type Response } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { initSseResponse, writeSseEvent } from 'src/common/sse.utils';
import { SttService, SttStream, STT_UPLOAD_GUARD_BYTES } from './stt.service';

/** SSE 事件：识别文本增量 / 完整结果 / 错误 */
type SttSseEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; text: string }
  | { type: 'error'; message: string };

/**
 * AI 通用能力接口
 */
@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly sttService: SttService) {}

  /**
   * 语音转文字（SSE 流式变体）：上传一段音频，实时推送识别文本增量。
   *
   * 前端可整段上传（说完再转），也可按句分片依次调用（句子级伪实时，
   * 分句策略见 docs/api/speech-to-text.md）。
   */
  @Post('stt/stream')
  // fileSize 是内存防滥用护栏（multer 接收过程中流式拦截，防止任意大小的
  // multipart body 整体缓冲进内存）；业务上限由 SttService 按
  // MIMO_ASR_MAX_BYTES 独立校验，两者职责解耦、无需保持同步
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: memoryStorage(),
      limits: { fileSize: STT_UPLOAD_GUARD_BYTES },
    }),
  )
  async transcribeStream(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!file) {
      throw new BadRequestException(
        '音频文件不能为空，请以 multipart/form-data 的 audio 字段上传',
      );
    }

    // 断连监听必须先于上游建连注册：否则建连 await 的窗口期断开，
    // 既不中止上游也不停止写帧
    let closed = false;
    const end = () => {
      if (!closed) {
        closed = true;
        res.end();
      }
    };
    const upstreamAbort = new AbortController();
    const handleDisconnect = () => {
      upstreamAbort.abort();
      end();
    };
    req.on('close', handleDisconnect);
    req.on('error', handleDisconnect);

    let handle: SttStream;
    try {
      handle = await this.sttService.transcribeStream(
        { buffer: file.buffer, mimeType: file.mimetype },
        { signal: upstreamAbort.signal },
      );
    } catch (error) {
      // 建连期间客户端已断开（含上游被中止引发的异常），静默结束
      if (closed) {
        return;
      }
      throw error;
    }
    if (closed) {
      handle.abort();
      return;
    }

    initSseResponse(res);

    const fullText: string[] = [];
    try {
      for await (const delta of handle.iterator) {
        if (closed) break;
        fullText.push(delta);
        writeSseEvent(res, {
          type: 'delta',
          text: delta,
        } satisfies SttSseEvent);
      }
      if (!closed) {
        writeSseEvent(res, {
          type: 'done',
          text: fullText.join(''),
        } satisfies SttSseEvent);
      }
    } catch (error: any) {
      this.logger.error('语音识别SSE错误', error?.stack);
      if (!closed) {
        writeSseEvent(res, {
          type: 'error',
          message: error?.message || '语音识别失败',
        } satisfies SttSseEvent);
      }
    } finally {
      // 双保险：断连时外部 signal 已中止真实上游，此处兜底中止句柄本身
      //（abort 幂等，正常完成时 closed=false 不会调用）
      if (closed) {
        handle.abort();
      }
      end();
    }
  }
}
