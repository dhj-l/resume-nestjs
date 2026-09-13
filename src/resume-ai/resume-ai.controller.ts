import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  InternalServerErrorException,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type Response } from 'express';
import { Observable } from 'rxjs';
import { ParseObjectIdPipe } from '@nestjs/mongoose';
import { ResumeAiService } from './resume-ai.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { initSseResponse, writeSseEvent } from 'src/common/sse.utils';
import { CreateAiResuemDto, ParserResumeDto } from './dto/createAiResuem.dto';
import { SseMessage } from './types/sse.types';
import { GetResumeRecordsDto } from 'src/resume-ai/dto/get-resume-record.dto';
import { PolishResumeDto } from './dto/polish-resume.dto';
import { UndoEditDto } from './dto/undo-edit.dto';
import { AnalyzeResumeDto } from './dto/analyze-resume.dto';
import { GetLatestAnalysisDto } from './dto/get-latest-analysis.dto';
import { GetAnalysisDetailDto } from './dto/get-analysis-detail.dto';
import { ExportAnalysisDto } from './dto/export-analysis.dto';
import { PredictQuestionsDto } from './dto/predict-questions.dto';
import {
  GetQuestionDetailDto,
  GetLatestQuestionDto,
} from './dto/get-question-record.dto';

@Controller('resume-ai')
@UseGuards(JwtAuthGuard)
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class ResumeAiController {
  private readonly logger = new Logger(ResumeAiController.name);

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
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
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
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
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
    const { userId } = req.user;

    // 先获取 SSE Observable：JD 校验失败等会同步抛错。
    // 此时尚未设置 SSE 响应头，异常交由全局过滤器按标准 JSON 错误格式返回，
    // 避免以 text/event-stream 头返回 JSON 错误体。
    let sseObservable: Observable<SseMessage>;
    try {
      sseObservable = this.resumeAiService.generateResumeSse(
        createAiResuemDto,
        userId,
      );
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error('SSE初始化错误', error.stack);
      throw new InternalServerErrorException('服务器内部错误');
    }

    // 成功后再设置 SSE 响应头（CORS 由全局配置统一处理，不在此手动设置）
    initSseResponse(res);

    // 订阅SSE消息流
    const subscription = sseObservable.subscribe({
      next: (message: SseMessage) => {
        writeSseEvent(res, message);
      },
      error: (error: Error) => {
        this.logger.error('SSE错误', error.stack);
        const errorMessage: SseMessage = {
          type: 'error',
          moduleName: 'system',
          status: 'failed',
          message: error.message || '连接错误',
          totalModules: 0,
          currentModule: 0,
          resumeId: (error as any)?.resumeId,
        };
        writeSseEvent(res, errorMessage);
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
      this.logger.error('连接错误', error.stack);
      subscription.unsubscribe();
      res.end();
    });
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
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
    }
  }

  /**
   * 删除简历生成记录（仅删除记录，不影响关联简历）
   */
  @Delete('records/:id')
  async deleteResumeRecord(
    @Param('id', ParseObjectIdPipe) id: string,
    @Req() req: { user: { userId: string } },
  ) {
    try {
      const { userId } = req.user;
      return await this.resumeAiService.deleteResumeRecord(userId, id);
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
    }
  }

  /**
   * AI润色简历模块内容
   */
  @Post('polish')
  async polishContent(@Body() polishResumeDto: PolishResumeDto, @Req() req) {
    try {
      const { userId } = req.user;
      return this.resumeAiService.polishContent(polishResumeDto, userId);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
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
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
    }
  }

  /**
   * AI分析简历与岗位JD的匹配度
   */
  @Post('analyze')
  async analyzeResume(@Body() analyzeResumeDto: AnalyzeResumeDto, @Req() req) {
    try {
      const { userId } = req.user;
      return await this.resumeAiService.analyzeResume(analyzeResumeDto, userId);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
    }
  }

  /**
   * 获取简历分析记录列表
   */
  @Get('analysis-records')
  async getAnalysisRecords(
    @Req() req: { user: { userId: string } },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
  ) {
    try {
      const { userId } = req.user;
      const parsedPage = page ? parseInt(page, 10) : 1;
      const parsedPageSize = pageSize ? parseInt(pageSize, 10) : 10;
      const validPage =
        Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
      const validPageSize =
        Number.isNaN(parsedPageSize) || parsedPageSize < 1
          ? 10
          : Math.min(parsedPageSize, 100);
      return await this.resumeAiService.getAnalysisRecords(
        userId,
        validPage,
        validPageSize,
        status,
        keyword,
      );
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
    }
  }

  /**
   * 删除简历分析记录
   */
  @Delete('analysis-records/:id')
  async deleteAnalysisRecord(
    @Param('id', ParseObjectIdPipe) id: string,
    @Req() req: { user: { userId: string } },
  ) {
    try {
      const { userId } = req.user;
      return await this.resumeAiService.deleteAnalysisRecord(userId, id);
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
    }
  }
  /**
   * 获取简历分析详情
   */
  @Get('analysis-detail')
  async getAnalysisDetail(
    @Query() dto: GetAnalysisDetailDto,
    @Req() req: { user: { userId: string } },
  ) {
    try {
      const data = await this.resumeAiService.getAnalysisDetailService(
        dto.id,
        req.user.userId,
      );
      return data;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
    }
  }

  /**
   * 查询简历最近一次的AI分析
   */
  @Get('latest-analysis')
  async getLatestAnalysis(
    @Query() dto: GetLatestAnalysisDto,
    @Req() req: { user: { userId: string } },
  ) {
    try {
      return await this.resumeAiService.getLatestAnalysisByResumeId(
        dto.resumeId,
        req.user.userId,
      );
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
    }
  }

  /**
   * AI面试押题
   */
  @Post('predict-questions')
  async predictQuestions(
    @Body() predictQuestionsDto: PredictQuestionsDto,
    @Req() req,
  ) {
    try {
      const { userId } = req.user;
      return await this.resumeAiService.predictInterviewQuestions(
        predictQuestionsDto,
        userId,
      );
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
    }
  }

  /**
   * 获取押题记录列表（分页）
   */
  @Get('question-records')
  async getQuestionRecords(
    @Req() req: { user: { userId: string } },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('keyword') keyword?: string,
  ) {
    try {
      const { userId } = req.user;
      const parsedPage = page ? parseInt(page, 10) : 1;
      const parsedPageSize = pageSize ? parseInt(pageSize, 10) : 10;
      const validPage =
        Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
      const validPageSize =
        Number.isNaN(parsedPageSize) || parsedPageSize < 1
          ? 10
          : Math.min(parsedPageSize, 100);
      return await this.resumeAiService.getQuestionRecords(
        userId,
        validPage,
        validPageSize,
        status,
        keyword,
      );
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
    }
  }

  /**
   * 删除 AI 押题记录
   */
  @Delete('question-records/:id')
  async deleteQuestionRecord(
    @Param('id', ParseObjectIdPipe) id: string,
    @Req() req: { user: { userId: string } },
  ) {
    try {
      const { userId } = req.user;
      return await this.resumeAiService.deleteQuestionRecord(userId, id);
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
    }
  }

  /**
   * 获取押题记录详情
   */
  @Get('question-detail')
  async getQuestionDetail(
    @Query() dto: GetQuestionDetailDto,
    @Req() req: { user: { userId: string } },
  ) {
    try {
      return await this.resumeAiService.getQuestionDetailService(
        dto.id,
        req.user.userId,
      );
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
    }
  }

  /**
   * 获取简历最近一次的押题记录
   */
  @Get('latest-questions')
  async getLatestQuestions(
    @Query() dto: GetLatestQuestionDto,
    @Req() req: { user: { userId: string } },
  ) {
    try {
      return await this.resumeAiService.getLatestQuestionsByResumeId(
        dto.resumeId,
        req.user.userId,
      );
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
    }
  }

  /**
   * 导出 AI 分析结果为 Markdown 文件
   */
  @Get('export-analysis/:id')
  async exportAnalysis(
    @Param() params: ExportAnalysisDto,
    @Req() req: { user: { userId: string } },
    @Res() res: Response,
  ) {
    try {
      const markdown = await this.resumeAiService.exportAnalysisMd(
        params.id,
        req.user.userId,
      );
      const filename = encodeURIComponent('简历分析报告.md');
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"; filename*=UTF-8''${filename}`,
      );
      res.send(markdown);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
    }
  }

  /**
   * 获取AI使用记录列表（分页）
   */
  @Get('usage-records')
  async getUsageRecords(
    @Req() req: { user: { userId: string } },
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('aiFunction') aiFunction?: string,
  ) {
    try {
      const { userId } = req.user;
      const parsedPage = page ? parseInt(page, 10) : 1;
      const parsedPageSize = pageSize ? parseInt(pageSize, 10) : 10;
      const validPage =
        Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
      const validPageSize =
        Number.isNaN(parsedPageSize) || parsedPageSize < 1
          ? 10
          : Math.min(parsedPageSize, 100);
      return await this.resumeAiService.getUsageRecords(
        userId,
        validPage,
        validPageSize,
        aiFunction,
      );
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
    }
  }

  /**
   * 获取AI使用统计
   */
  @Get('usage-stats')
  async getUsageStats(@Req() req: { user: { userId: string } }) {
    try {
      const { userId } = req.user;
      return await this.resumeAiService.getUsageStats(userId);
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
    }
  }
}
