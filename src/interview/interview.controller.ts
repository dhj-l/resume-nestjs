import {
  Controller,
  Get,
  HttpException,
  InternalServerErrorException,
  Logger,
  Param,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type Response } from 'express';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import {
  CreateInterviewSessionDto,
  SubmitAnswerDto,
} from './dto/create-interview-session.dto';
import {
  InterviewService,
  SseEvent,
} from './interview.service';

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
    try {
      return await this.interviewService.createSession(dto, req.user.userId);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  /**
   * 获取我的进行中会话；若已超时则自动关闭后返回该会话（endedReason=timeout）
   */
  @Get('sessions/current')
  async getCurrentSession(@Req() req: { user: { userId: string } }) {
    try {
      const session = await this.interviewService.getCurrentSession(
        req.user.userId,
      );
      return { active: !!session && session.status === 'in_progress', session };
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  /**
   * 会话详情（含对话历史）
   */
  @Get('sessions/:id')
  async getSessionDetail(
    @Param('id') id: string,
    @Req() req: { user: { userId: string } },
  ) {
    try {
      return await this.interviewService.getSessionDetail(id, req.user.userId);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  /**
   * 提交回答：返回下一题；最后一轮自动结束并生成报告
   */
  @Post('sessions/:id/answers')
  async submitAnswer(
    @Param('id') id: string,
    @Body() dto: SubmitAnswerDto,
    @Req() req: { user: { userId: string } },
  ) {
    try {
      return await this.interviewService.submitAnswer(id, dto, req.user.userId);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  /**
   * 提交回答（SSE 流式变体）：实时推送下一题生成结果
   * 为后续语音通话场景的 TTS 文本流预留。
   */
  @Post('sessions/:id/answers/stream')
  submitAnswerSse(
    @Param('id') id: string,
    @Body() dto: SubmitAnswerDto,
    @Req() req: any,
    @Res() res: Response,
  ): void {
    // 先获取 Observable：校验失败等同步异常交由全局过滤器按 JSON 错误格式返回
    let events$: Observable<SseEvent>;
    try {
      events$ = this.interviewService.submitAnswerSse(
        id,
        dto,
        req.user.userId,
      );
    } catch (error: any) {
      throw this.wrapError(error);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const subscription = events$.subscribe({
      next: (event: SseEvent) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      },
      error: (error: Error) => {
        this.logger.error('面试SSE错误', error.stack);
        const errorEvent: SseEvent = {
          type: 'error',
          message: error.message || '连接错误',
        };
        res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
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
   * 用户主动收尾：立即基于已有问答生成评价报告
   */
  @Post('sessions/:id/finish')
  async finishSession(
    @Param('id') id: string,
    @Req() req: { user: { userId: string } },
  ) {
    try {
      return await this.interviewService.finishSession(id, req.user.userId);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  /**
   * 用户强制中断：不出报告，直接关闭会话释放单会话名额
   */
  @Post('sessions/:id/cancel')
  async cancelSession(
    @Param('id') id: string,
    @Req() req: { user: { userId: string } },
  ) {
    try {
      return await this.interviewService.cancelSession(id, req.user.userId);
    } catch (error) {
      throw this.wrapError(error);
    }
  }

  /**
   * 获取评价报告
   */
  @Get('sessions/:id/report')
  async getReport(
    @Param('id') id: string,
    @Req() req: { user: { userId: string } },
  ) {
    try {
      return await this.interviewService.getReport(id, req.user.userId);
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
