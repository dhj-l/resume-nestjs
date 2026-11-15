import {
  Controller,
  Get,
  HttpException,
  InternalServerErrorException,
  Logger,
  Param,
  Post,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type Response } from 'express';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { initSseResponse, writeSseEvent } from 'src/common/sse.utils';
import {
  CreateInterviewSessionDto,
  SubmitAnswerDto,
} from './dto/create-interview-session.dto';
import { ListInterviewSessionsDto } from './dto/list-interview-sessions.dto';
import { InterviewTtsQueryDto } from './dto/interview-tts.dto';
import { InterviewService, SseEvent } from './interview.service';

@Controller('interview')
@UseGuards(JwtAuthGuard)
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class InterviewController {
  private readonly logger = new Logger(InterviewController.name);

  constructor(private readonly interviewService: InterviewService) {}

  /**
   * 创建模拟面试会话：校验 JD 与简历归属，生成考察大纲与第一题
   */
  @Post('sessions')
  async createSession(
    @Body() dto: CreateInterviewSessionDto,
    @Req() req: { user: { userId: string } },
  ) {
    return this.run(() =>
      this.interviewService.createSession(dto, req.user.userId),
    );
  }

  /**
   * 分页获取我的面试记录列表（不含对话历史与报告正文）
   */
  @Get('sessions')
  async listSessions(
    @Query() query: ListInterviewSessionsDto,
    @Req() req: { user: { userId: string } },
  ) {
    return this.run(() =>
      this.interviewService.listSessions(req.user.userId, query),
    );
  }

  /**
   * 获取我的进行中会话；若已超时则自动关闭后返回该会话（endedReason=timeout）
   */
  @Get('sessions/current')
  async getCurrentSession(@Req() req: { user: { userId: string } }) {
    const session = await this.run(() =>
      this.interviewService.getCurrentSession(req.user.userId),
    );
    return { active: !!session && session.status === 'in_progress', session };
  }

  /**
   * 会话详情（含对话历史）
   */
  @Get('sessions/:id')
  async getSessionDetail(
    @Param('id') id: string,
    @Req() req: { user: { userId: string } },
  ) {
    return this.run(() =>
      this.interviewService.getSessionDetail(id, req.user.userId),
    );
  }

  /**
   * 提交回答：主体考察阶段返回逐题反馈与下一题；
   * 面试收尾时自动转入反问环节，反问结束后自动生成报告
   */
  @Post('sessions/:id/answers')
  async submitAnswer(
    @Param('id') id: string,
    @Body() dto: SubmitAnswerDto,
    @Req() req: { user: { userId: string } },
  ) {
    return this.run(() =>
      this.interviewService.submitAnswer(id, dto, req.user.userId),
    );
  }

  /**
   * 获取反问环节的推荐话术（按面试轮次与面试官角色生成，可直接使用）
   */
  @Get('sessions/:id/reverse-suggestions')
  async getReverseSuggestions(
    @Param('id') id: string,
    @Req() req: { user: { userId: string } },
  ) {
    const suggestions = await this.run(() =>
      this.interviewService.getReverseSuggestions(id, req.user.userId),
    );
    // 与 docs/api/mock-interview.md 的响应契约一致：data.suggestions
    return { suggestions };
  }

  /**
   * 提交回答（SSE 流式变体）：依次推送 init → feedback（逐题反馈）→
   * question / finished 事件。
   * 为后续语音通话场景的 TTS 文本流预留。
   */
  @Post('sessions/:id/answers/stream')
  async submitAnswerSse(
    @Param('id') id: string,
    @Body() dto: SubmitAnswerDto,
    @Req() req: any,
    @Res() res: Response,
  ): Promise<void> {
    // 先 await 事件流：会话不存在/已结束/超时等业务校验在 service 内部
    // 于返回流之前抛出，此时尚未设置 SSE 头，异常交由全局过滤器按
    // 标准 JSON 错误格式返回（404/409）
    const events$ = await this.run(() =>
      this.interviewService.submitAnswerSse(id, dto, req.user.userId),
    );

    initSseResponse(res);

    this.pipeSse(req, res, events$, (error) => {
      this.logger.error('面试SSE错误', error.stack);
      const errorEvent: SseEvent = {
        type: 'error',
        // 仅透传业务异常消息，内部错误细节不泄漏给客户端
        message:
          error instanceof HttpException ? error.message : '服务器内部错误',
      };
      writeSseEvent(res, errorEvent);
    });
  }

  /**
   * 用户主动收尾：立即基于已有问答生成评价报告
   */
  @Post('sessions/:id/finish')
  async finishSession(
    @Param('id') id: string,
    @Req() req: { user: { userId: string } },
  ) {
    return this.run(() =>
      this.interviewService.finishSession(id, req.user.userId),
    );
  }

  /**
   * 用户强制中断：不出报告，直接关闭会话释放单会话名额
   */
  @Post('sessions/:id/cancel')
  async cancelSession(
    @Param('id') id: string,
    @Req() req: { user: { userId: string } },
  ) {
    return this.run(() =>
      this.interviewService.cancelSession(id, req.user.userId),
    );
  }

  /**
   * 获取评价报告
   */
  @Get('sessions/:id/report')
  async getReport(
    @Param('id') id: string,
    @Req() req: { user: { userId: string } },
  ) {
    return this.run(() => this.interviewService.getReport(id, req.user.userId));
  }

  /**
   * 获取指定轮次面试官问题的语音（wav 二进制流）
   * 同会话同轮次音频内容不变，浏览器可按 max-age 缓存
   */
  @Get('sessions/:id/tts')
  async getQuestionTts(
    @Param('id') id: string,
    @Query() query: InterviewTtsQueryDto,
    @Req() req: { user: { userId: string } },
    @Res() res: Response,
  ): Promise<void> {
    await this.run(async () => {
      const audio = await this.interviewService.getQuestionAudio(
        id,
        req.user.userId,
        query.round,
      );
      res.setHeader('Content-Type', audio.mimeType);
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.send(audio.buffer);
    });
  }

  /**
   * 获取指定轮次面试官问题的流式语音（SSE，边合成边推送）
   *
   * 事件序列：meta（采样率）→ chunk（base64 PCM16）×N → done；
   * 失败时在流内发 error 事件。会话/轮次校验错误仍是标准 JSON 包络
   * （在校验期间断开的客户端不会触发任何上游合成）。
   * * 与 POST /answers/stream 同一模式：消费端需 fetch + ReadableStream（带
   * JWT header），不能用 EventSource；生产环境经 nginx 时依赖
   * X-Accel-Buffering: no 逐帧透传。
   */
  @Get('sessions/:id/tts/stream')
  async getQuestionTtsStream(
    @Param('id') id: string,
    @Query() query: InterviewTtsQueryDto,
    @Req() req: any,
    @Res() res: Response,
  ): Promise<void> {
    // 立即注册断连监听：service 的校验读取与上游建连耗时期间，
    // 客户端可能已经离开页面
    let clientGone = false;
    req.on('close', () => {
      clientGone = true;
    });
    req.on('error', () => {
      clientGone = true;
    });

    // 先获取事件流：业务校验失败等会异步同步抛错，此时尚未设置 SSE 头，
    // 异常交由全局过滤器按标准 JSON 错误格式返回
    const events$ = await this.run(() =>
      this.interviewService.getQuestionAudioStreamEvents(
        id,
        req.user.userId,
        query.round,
      ),
    );
    if (clientGone) {
      // 等待期间客户端已断开：不再订阅（上游建连也尚未发生，零合成成本）
      return;
    }

    initSseResponse(res);

    // 业务异常已作为 error 事件写入，这里仅是兜底
    this.pipeSse(req, res, events$, (error) => {
      this.logger.error('TTS 流式事件错误', error.stack);
    });
  }

  /**
   * 订阅事件流并以 SSE 帧写出（两个流式端点共用）
   *
   * complete/error 时结束响应；客户端断开（close/error）时立即取消订阅，
   * 事件流内部据此中止上游请求（TTS 合成不再产生费用）。
   * 调用方负责在调用前完成业务校验并设置 SSE 头。
   */
  private pipeSse<T>(
    req: any,
    res: Response,
    events$: Observable<T>,
    onError: (error: Error) => void,
  ): void {
    const subscription = events$.subscribe({
      next: (event: T) => {
        writeSseEvent(res, event);
      },
      error: (error: Error) => {
        onError(error);
        res.end();
      },
      complete: () => res.end(),
    });

    req.on('close', () => {
      subscription.unsubscribe();
      res.end();
    });
    req.on('error', () => {
      subscription.unsubscribe();
      res.end();
    });
  }

  /**
   * 统一的错误包装入口（全部路由共用）：业务异常原样透传，
   * 未知异常记日志后收敛为 500 通用文案
   */
  private async run<T>(task: () => Promise<T>): Promise<T> {
    try {
      return await task();
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  private wrapError(error: unknown): Error {
    if (error instanceof HttpException) {
      return error;
    }
    const err = error as Error;
    this.logger.error(err.message, err.stack);
    return new InternalServerErrorException('服务器内部错误');
  }
}
