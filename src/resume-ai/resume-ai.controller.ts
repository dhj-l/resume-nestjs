import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  Headers,
  Res,
  Query,
  Get,
} from '@nestjs/common';
import { type Response } from 'express';
import { ResumeAiService } from './resume-ai.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CreateAiResuemDto, ParserResumeDto } from './dto/createAiResuem.dto';
import { SseMessage } from './types/sse.types';
import { GetResumeRecordsDto } from 'src/resume-ai/dto/get-resume-record.dto';
import { PolishResumeDto } from './dto/polish-resume.dto';
import { UndoEditDto } from './dto/undo-edit.dto';

@Controller('resume-ai')
@UseGuards(JwtAuthGuard)
export class ResumeAiController {
  constructor(private readonly resumeAiService: ResumeAiService) {}
  @Post('generate')
  async generateResume(
    @Body() createAiResuemDto: CreateAiResuemDto,
    @Req() req,
  ) {
    try {
      const { userId } = req.user;
      return this.resumeAiService.generateResume(createAiResuemDto, userId);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
  /**
   * 解析简历
   */
  @Post('parse')
  async parseResume(@Body() parserResumeDto: ParserResumeDto, @Req() req) {
    try {
      const { userId } = req.user;
      return this.resumeAiService.parseResume(parserResumeDto, userId);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
  /**
   * SSE生成简历
   * 使用Server-Sent Events实时推送简历生成进度
   */
  @Post('generatesse')
  generateResumeSse(
    @Body() createAiResuemDto: CreateAiResuemDto,
    @Req() req: any,
    @Res() res: Response,
  ): void {
    try {
      const { userId } = req.user;

      // 设置SSE响应头
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Access-Control-Allow-Origin', '*');

      // 获取SSE Observable
      const sseObservable = this.resumeAiService.generateResumeSse(
        createAiResuemDto,
        userId,
      );

      // 订阅SSE消息流
      const subscription = sseObservable.subscribe({
        next: (message: SseMessage) => {
          // 将SSE消息格式化为SSE格式
          const sseData = `data: ${JSON.stringify(message)}\n\n`;
          res.write(sseData);
        },
        error: (error: Error) => {
          console.error('SSE错误:', error);
          const errorMessage: SseMessage = {
            type: 'error',
            moduleName: 'system',
            status: 'failed',
            message: error.message || '连接错误',
            totalModules: 0,
            currentModule: 0,
          };
          res.write(`data: ${JSON.stringify(errorMessage)}\n\n`);
          res.end();
        },
        complete: () => {
          res.end();
        },
      });

      // 处理客户端断开连接
      req.on('close', () => {
        subscription.unsubscribe();
        res.end();
      });

      // 处理连接错误
      req.on('error', (error: Error) => {
        console.error('连接错误:', error);
        subscription.unsubscribe();
        res.end();
      });
    } catch (error: any) {
      console.error('SSE初始化错误:', error);
      throw new BadRequestException(error.message);
    }
  }

  /**
   * 获取简历生成记录
   */
  @Get('records')
  async getResumeRecords(
    @Req() req: { user: { userId: string } },
    @Query() query: GetResumeRecordsDto,
  ) {
    try {
      const { userId } = req.user;
      return await this.resumeAiService.getResumeRecords(userId, query);
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * AI润色简历模块内容
   */
  @Post('polish')
  async polishContent(
    @Body() polishResumeDto: PolishResumeDto,
    @Req() req,
  ) {
    try {
      const { userId } = req.user;
      return this.resumeAiService.polishContent(polishResumeDto, userId);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * 撤销AI润色操作
   */
  @Post('undo')
  async undoEdit(@Body() undoEditDto: UndoEditDto, @Req() req) {
    try {
      const { userId } = req.user;
      return this.resumeAiService.undoEdit(undoEditDto, userId);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
