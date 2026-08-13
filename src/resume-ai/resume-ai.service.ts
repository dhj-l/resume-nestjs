import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CreateAiResuemDto, ParserResumeDto } from './dto/createAiResuem.dto';
import {
  ResumeAi,
  ResumeAiStatusEnum,
  ResumeAiTypeEnum,
} from './entities/resume-ai.entity';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PromptTemplate } from '@langchain/core/prompts';
import { ContentPrompt, resumeAiPrompt } from './prompt/resume_ai';
import { AiService } from 'src/ai/ai.service';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { ResumeSchema, AnalysisSchema } from './schemas';
import { z } from 'zod';
import { Resume } from 'src/resume/entities/resume.entity';
import { CreateResumeDto } from 'src/resume/dto/create-resume.dto';
import { DocumentParserService } from './document-parser.service';
import {
  MAX_LENGTH,
  MIN_CHINESE_LENGTH,
  MIN_ENGLISH_LENGTH,
  MIN_PARAGRAPHS,
  MIN_LINE_BREAKS,
  JD_KEYWORD_GROUPS,
  JD_REQUIRED_KEYWORD_COUNT,
  PROHIBITED_TERMS,
  VALIDATION_MESSAGES,
  matchKeywordGroup,
} from './constants/job-validation.constants';
import {
  RESUME_MIN_LENGTH,
  RESUME_MAX_LENGTH,
  RESUME_MIN_PARAGRAPHS,
  RESUME_MIN_LINE_BREAKS,
  RESUME_MIN_DATE_COUNT,
  RESUME_PASSING_SCORE,
  RESUME_KEYWORD_GROUPS,
  RESUME_REQUIRED_KEYWORD_GROUPS,
  RESUME_VALIDATION_MESSAGES,
  REQUIRED_KEYWORD_GROUPS,
  ValidationDetails,
  ValidationResult,
  matchResumeKeywordGroup,
  normalizeCjkText,
  countDatePatterns,
  hasContactInfo,
  hasNonResumeContent,
} from './constants/resume-validation.constants';
import { Observable, Subject, interval, throwError } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import {
  SseMessage,
  ModuleResult,
  RetryConfig,
  HeartbeatConfig,
} from './types/sse.types';
import {
  MODULE_PROMPTS,
  MODULE_EXECUTION_ORDER,
  MODULE_DEFAULTS,
  ModuleName,
} from './prompt/modules';
import { GetResumeRecordsDto } from './dto/get-resume-record.dto';
import { ResumeEditRecord } from './entities/resume-edit-record.entity';
import { toResumeRecordResponse } from './resume-records.mapper';
import { PolishResumeDto } from './dto/polish-resume.dto';
import { UndoEditDto } from './dto/undo-edit.dto';
import { polishContentPrompt } from './prompt/polish-content.prompt';
import { AnalyzeResumeDto } from './dto/analyze-resume.dto';
import {
  ResumeAnalysisRecord,
  AnalysisStatusEnum,
} from './entities/resume-analysis-record.entity';
import { analyzeResumePrompt } from './prompt/analyze-resume.prompt';
import { formatDate } from '../common/utils/date';
import {
  AiUsageRecord,
  AiFunctionEnum,
} from './entities/ai-usage-record.entity';
import {
  ANALYSIS_INPUT_BUDGET,
  ANALYSIS_INPUT_BUDGET_FALLBACK,
  ANALYSIS_TIMEOUT_MS,
  buildTruncatedAnalysisContext,
  normalizeAnalysisResult,
} from './analysis.utils';
import {
  ResumeQuestionRecord,
  QuestionStatusEnum,
} from './entities/resume-question-record.entity';
import { interviewQuestionsPrompt } from './prompt/interview-questions.prompt';
import { PredictQuestionsDto } from './dto/predict-questions.dto';
import {
  InterviewQuestionSchema,
  QUESTION_COUNT_MAX,
  QUESTION_COUNT_MIN,
  normalizeInterviewQuestions,
} from './schemas/question.schema';

/**
 * 将数组格式化为 Markdown 列表字符串，空数组返回「无」
 */
function listOrNone(arr: string[] | undefined | null): string {
  if (!arr || arr.length === 0) return '无';
  return arr.map((item) => `\`${item}\``).join('、');
}

@Injectable()
export class ResumeAiService {
  private readonly logger = new Logger(ResumeAiService.name);

  constructor(
    @InjectModel(ResumeAi.name) private resumeAiModel: Model<ResumeAi>,
    @InjectModel(Resume.name) private resumeModel: Model<Resume>,
    @InjectModel(ResumeEditRecord.name)
    private editRecordModel: Model<ResumeEditRecord>,
    @InjectModel(ResumeAnalysisRecord.name)
    private analysisRecordModel: Model<ResumeAnalysisRecord>,
    @InjectModel(AiUsageRecord.name)
    private aiUsageRecordModel: Model<AiUsageRecord>,
    @InjectModel(ResumeQuestionRecord.name)
    private questionRecordModel: Model<ResumeQuestionRecord>,
    private readonly aiService: AiService,
    private readonly documentParserService: DocumentParserService,
  ) {}
  /**
   * 入口函数
   */
  async generateResume(createAiResuemDto: CreateAiResuemDto, userId: string) {
    const { parseType, jobDescription } = createAiResuemDto;
    const { isValid, reason } = this.validateJobDescription(jobDescription);

    if (!isValid) {
      throw new BadRequestException(reason);
    }
    switch (parseType) {
      case ResumeAiTypeEnum.Manual:
        return await this.generateManualResume(createAiResuemDto, userId);
      case ResumeAiTypeEnum.Upload:
        return await this.generateUploadResume(createAiResuemDto, userId);
      case ResumeAiTypeEnum.Select:
        return await this.generateSelectResume(createAiResuemDto, userId);
      default:
        throw new BadRequestException('Invalid resume type');
    }
  }

  /**
   * 上传简历生成
   */
  async generateUploadResume(
    createAiResuemDto: CreateAiResuemDto,
    userId: string,
  ) {
    //检查当前用户是否存在正在创建的简历
    await this.checkExistResume(userId);
    const { resumeContent, jobDescription } = createAiResuemDto;
    const { isValid, reason } = this.validateResumeContent(resumeContent!);
    if (!isValid) {
      throw new BadRequestException(reason);
    }
    //创建记录
    const record = await this.createRecord(userId, {
      ...createAiResuemDto,
      resumeContent,
    });
    const aiStartTime = Date.now();
    try {
      const res = await this.createResumeByAi(jobDescription, resumeContent!);
      const aiDuration = Date.now() - aiStartTime;
      //根据res创建简历
      const resume = await this.createResume(
        res as CreateResumeDto,
        record.templateType,
        userId,
      );
      // 保存生成的简历ID
      record.generatedResumeId = resume._id.toString();
      try {
        await record.save();
      } catch (saveError) {
        // record.save 失败时，清理已创建的孤立简历
        await this.resumeModel.findByIdAndDelete(resume._id).catch(() => {});
        throw saveError;
      }
      // 修改状态（简历已创建成功后再标记完成）
      await this.updateRecordStatus(
        record._id.toString(),
        ResumeAiStatusEnum.Completed,
      );
      void this.recordAiUsage({
        userId,
        aiFunction: AiFunctionEnum.ResumeGeneration,
        success: true,
        duration: aiDuration,
        resumeId: resume._id.toString(),
        metadata: { parseType: ResumeAiTypeEnum.Upload },
      });
      return resume;
    } catch {
      void this.recordAiUsage({
        userId,
        aiFunction: AiFunctionEnum.ResumeGeneration,
        success: false,
        duration: Date.now() - aiStartTime,
        errorMessage: 'ai创建简历失败',
        metadata: { parseType: ResumeAiTypeEnum.Upload },
      });
      // 捕获异常，更新记录状态为失败
      await this.updateRecordStatus(
        record._id.toString(),
        ResumeAiStatusEnum.Failed,
      );
      throw new BadRequestException('ai创建简历失败');
    }
  }

  /**
   * 选择已存在的简历
   */
  async generateSelectResume(
    createAiResuemDto: CreateAiResuemDto,
    userId: string,
  ) {
    const { resumeId, jobDescription } = createAiResuemDto;
    //判断当前用户是否存在正在创建的简历
    await this.checkExistResume(userId);
    //根据resumeId查询简历
    const resume = await this.resumeModel
      .findOne({
        _id: resumeId,
        userId,
      })
      .select(
        '-_id title skills certificates selfEvaluation educationBackground workExperience campusExperience projectExperience internshipExperience basicInfo globalStyle jobIntention',
      );
    if (!resume) {
      throw new BadRequestException('不存在该简历');
    }
    const content = this.parseSupplementary(resume.toObject());
    const { isValid, reason } = this.validateResumeContent(content);
    if (!isValid) {
      throw new BadRequestException(reason);
    }
    //创建记录
    const record = await this.createRecord(userId, {
      ...createAiResuemDto,
      resumeContent: content,
    });
    const aiStartTime = Date.now();
    try {
      const res = await this.createResumeByAi(jobDescription, content);
      const aiDuration = Date.now() - aiStartTime;
      //根据res创建简历
      const resume = await this.createResume(
        res as CreateResumeDto,
        record.templateType,
        userId,
      );
      // 保存生成的简历ID
      record.generatedResumeId = resume._id.toString();
      try {
        await record.save();
      } catch (saveError) {
        await this.resumeModel.findByIdAndDelete(resume._id).catch(() => {});
        throw saveError;
      }
      // 修改状态（简历已创建成功后再标记完成）
      await this.updateRecordStatus(
        record._id.toString(),
        ResumeAiStatusEnum.Completed,
      );
      void this.recordAiUsage({
        userId,
        aiFunction: AiFunctionEnum.ResumeGeneration,
        success: true,
        duration: aiDuration,
        resumeId: resume._id.toString(),
        metadata: { parseType: ResumeAiTypeEnum.Select },
      });
      return resume;
    } catch {
      void this.recordAiUsage({
        userId,
        aiFunction: AiFunctionEnum.ResumeGeneration,
        success: false,
        duration: Date.now() - aiStartTime,
        errorMessage: 'ai创建简历失败',
        metadata: { parseType: ResumeAiTypeEnum.Select },
      });
      // 捕获异常，更新记录状态为失败
      await this.updateRecordStatus(
        record._id.toString(),
        ResumeAiStatusEnum.Failed,
      );
      throw new BadRequestException('ai创建简历失败');
    }
  }

  /**
   * 手动生成简历
   */
  async generateManualResume(
    createAiResuemDto: CreateAiResuemDto,
    userId: string,
  ) {
    const { detailInfo, jobDescription } = createAiResuemDto;
    //判断当前用户是否存在正在创建的简历
    await this.checkExistResume(userId);
    //解析传入的详细信息
    const content = this.parseSupplementary(detailInfo!);

    //创建记录
    const record = await this.createRecord(userId, {
      ...createAiResuemDto,
      resumeContent: content,
    });
    const id = record._id.toString();
    const aiStartTime = Date.now();
    try {
      //调用 AI 模型创建简历
      const res = await this.createResumeByAi(jobDescription, content);
      const aiDuration = Date.now() - aiStartTime;
      //根据res创建简历
      const resume = await this.createResume(
        res as CreateResumeDto,
        record.templateType,
        userId,
      );
      // 保存生成的简历ID
      record.generatedResumeId = resume._id.toString();
      try {
        await record.save();
      } catch (saveError) {
        await this.resumeModel.findByIdAndDelete(resume._id).catch(() => {});
        throw saveError;
      }
      // 更新记录状态（简历已创建成功后再标记完成）
      await this.updateRecordStatus(id, ResumeAiStatusEnum.Completed);
      void this.recordAiUsage({
        userId,
        aiFunction: AiFunctionEnum.ResumeGeneration,
        success: true,
        duration: aiDuration,
        resumeId: resume._id.toString(),
        metadata: { parseType: ResumeAiTypeEnum.Manual },
      });
      return resume;
    } catch {
      void this.recordAiUsage({
        userId,
        aiFunction: AiFunctionEnum.ResumeGeneration,
        success: false,
        duration: Date.now() - aiStartTime,
        errorMessage: 'ai创建简历失败',
        metadata: { parseType: ResumeAiTypeEnum.Manual },
      });
      // 捕获异常，更新记录状态为失败
      await this.updateRecordStatus(id, ResumeAiStatusEnum.Failed);
      throw new BadRequestException('ai创建简历失败');
    }
  }

  /**
   * 检查当前用户是否存在正在创建的简历
   */
  async checkExistResume(userId: string) {
    const existResume = await this.resumeAiModel.findOne({
      userId,
      status: ResumeAiStatusEnum.Creating,
    });
    if (existResume) {
      throw new BadRequestException('存在正在创建的简历,请稍后尝试');
    }
  }
  /**
   * 解析信息
   */
  parseSupplementary(record: Record<string, any>) {
    let content = '';
    for (const key in record) {
      if (Array.isArray(record[key])) {
        content += this.parseSupplementary(record[key]) + '\n ';
      } else if (record[key] !== null && typeof record[key] === 'object') {
        content += this.parseSupplementary(record[key]) + '\n ';
      } else {
        content += `${key}: ${record[key]}\n `;
      }
    }
    return content;
  }

  /**
   * 创建记录
   */
  async createRecord(userId: string, record: Record<string, any>) {
    const newRecord = await this.resumeAiModel.create({
      ...record,
      userId,
      status: ResumeAiStatusEnum.Creating,
    });
    return newRecord;
  }

  /**
   * 修改记录状态(原子操作)
   * @param id 记录 ID
   * @param status 新状态
   */
  async updateRecordStatus(id: string, status: ResumeAiStatusEnum) {
    /**
     * 使用单次 updateOne 保证在数据库层面为原子操作
     * 同时检查 matchedCount，确保记录存在，避免静默失败导致数据不一致
     */
    const result = await this.resumeAiModel.updateOne(
      {
        _id: id,
      },
      {
        $set: {
          status,
        },
      },
    );

    if (result.matchedCount === 0) {
      throw new BadRequestException('AI 简历记录不存在或已被删除');
    }
  }

  /**
   * 记录AI使用情况（静默记录，失败不影响主流程）
   */
  private async recordAiUsage(params: {
    userId: string;
    aiFunction: string;
    success: boolean;
    duration: number;
    errorMessage?: string;
    resumeId?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      await this.aiUsageRecordModel.create(params);
    } catch (error) {
      this.logger.error('记录AI使用情况失败', (error as Error).stack);
    }
  }

  /**
   * ai创建简历（带自动重试）
   * @param jd 岗位 JD
   * @param content 详细信息
   */
  async createResumeByAi(jd: string, content: string) {
    const MAX_RETRIES = 2;
    const RETRY_DELAY_MS = 1500;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const propmt = PromptTemplate.fromTemplate(resumeAiPrompt);
        const model = this.aiService.generateResume();
        const parser = this.aiService.createStructuredParser(ResumeSchema);
        const chain = propmt.pipe(model).pipe(parser);
        const res = await chain.invoke({
          jd,
          experience: content,
          current_date: formatDate(),
        });

        return res;
      } catch (error) {
        lastError = error;
        this.logger.warn(
          `createResumeByAi 第 ${attempt + 1} 次失败，${MAX_RETRIES - attempt} 次重试剩余`,
        );
        if (attempt < MAX_RETRIES) {
          await this.sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
        }
      }
    }

    this.logger.error('ai创建简历失败', lastError?.stack);
    throw new BadRequestException('AI 创建简历失败，请稍后重试');
  }

  /**
   * 创建简历
   * @param resume 简历信息
   * @param type 简历模板类型
   * @param userId 用户 ID
   * @param aiStatus AI 生成状态（AI 草稿使用，普通创建不传）
   */
  async createResume(
    resume: CreateResumeDto,
    type: string,
    userId: string,
    aiStatus?: string,
  ) {
    const res = await this.resumeModel.create({
      ...resume,
      type,
      userId,
      user: new Types.ObjectId(userId),
      ...(aiStatus ? { aiStatus } : {}),
    });
    return res;
  }

  /**
   * 构造草稿初始数据
   * Select 场景继承原简历模块字段；其余场景使用 MODULE_DEFAULTS
   */
  private buildDraftData(
    source?: Record<string, any>,
  ): Record<string, unknown> {
    const defaults = { ...MODULE_DEFAULTS };
    if (!source) {
      return defaults;
    }
    const {
      _id,
      userId: _userId,
      user: _user,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      __v,
      isTemplate: _isTemplate,
      cover: _cover,
      title: _title,
      type: _type,
      aiStatus: _aiStatus,
      ...moduleData
    } = source;
    return { ...defaults, ...moduleData };
  }

  /**
   * 模块生成后增量写入草稿（失败仅告警，不阻断主流程）
   */
  private async updateDraftModule(
    resumeId: string,
    moduleName: string,
    data: any,
  ): Promise<void> {
    try {
      await this.resumeModel.findByIdAndUpdate(resumeId, {
        $set: { [moduleName]: data },
      });
    } catch (error) {
      this.logger.warn(
        `草稿模块落库失败: ${moduleName}`,
        (error as Error).message,
      );
    }
  }

  /**
   * 组装 AI 生成简历标题：用户名-岗位名称
   * Manual 用 detailInfo；Select 继承原简历基本信息/求职意向；
   * Upload 从简历文本提取；无法提取时回退为 "AI 生成简历"。
   */
  private buildAiResumeTitle(
    createAiResuemDto: CreateAiResuemDto,
    source?: Record<string, any>,
  ): string {
    let name = '';
    let role = '';

    if (createAiResuemDto.parseType === ResumeAiTypeEnum.Manual) {
      name = createAiResuemDto.detailInfo?.name?.trim() ?? '';
      role = createAiResuemDto.detailInfo?.targetRole?.trim() ?? '';
    } else if (createAiResuemDto.parseType === ResumeAiTypeEnum.Select) {
      const jobIntention = source?.jobIntention ?? {};
      name = source?.basicInfo?.name?.trim() ?? '';
      role =
        jobIntention.jobIntention?.trim() ??
        jobIntention.position?.trim() ??
        '';
    } else if (createAiResuemDto.parseType === ResumeAiTypeEnum.Upload) {
      const resumeContent = createAiResuemDto.resumeContent ?? '';
      name = this.extractFieldFromText(resumeContent, ['姓名']);
      role = this.extractFieldFromText(resumeContent, ['求职意向', '意向岗位']);
    }

    if (!name && !role) {
      return 'AI 生成简历';
    }
    return [name, role].filter(Boolean).join('-');
  }

  /**
   * 从简历文本中提取标签后的字段值（截断到换行/逗号/竖线等分隔符）
   */
  private extractFieldFromText(text: string, labels: string[]): string {
    for (const label of labels) {
      const match = text.match(
        new RegExp(`${label}[\\s:：]*([^|\\n\\r，,。；;]+)`),
      );
      if (match?.[1]) {
        return match[1].trim();
      }
    }
    return '';
  }

  /**
   * 解析简历（带自动重试）
   */
  async parseResume(parserResumeDto: ParserResumeDto, userId: string) {
    const MAX_RETRIES = 2;
    const RETRY_DELAY_MS = 1500;
    const MAX_INPUT_LENGTH = 8000;

    let lastError: Error | null = null;

    await this.checkExistResume(userId);
    const { resumeContent, templateType, templateId } = parserResumeDto;

    // 校验简历内容是否合格
    const { isValid, reason } = this.validateResumeContent(resumeContent);
    if (!isValid) {
      throw new BadRequestException(reason);
    }

    // 输入截断保护：防止 token 溢出
    const truncatedContent =
      resumeContent.length > MAX_INPUT_LENGTH
        ? resumeContent.slice(0, MAX_INPUT_LENGTH) +
          '\n\n[因内容过长已截断，仅保留前8000字符]'
        : resumeContent;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const startTime = Date.now();
      try {
        const prompt = PromptTemplate.fromTemplate(ContentPrompt);
        const model = this.aiService.generateImportResume();
        const parser = this.aiService.createStructuredParser(ResumeSchema);
        const chain = prompt.pipe(model).pipe(parser);
        const current = formatDate();
        const res = await chain.invoke({
          resume_text: truncatedContent,
          current_date: current,
        });
        const aiDuration = Date.now() - startTime;
        const result = await this.createResume(
          { ...res, templateId } as CreateResumeDto,
          templateType,
          userId,
        );
        void this.recordAiUsage({
          userId,
          aiFunction: AiFunctionEnum.SmartImport,
          success: true,
          duration: aiDuration,
          resumeId: result._id.toString(),
        });
        return result;
      } catch (error) {
        lastError = error;
        void this.recordAiUsage({
          userId,
          aiFunction: AiFunctionEnum.SmartImport,
          success: false,
          duration: Date.now() - startTime,
          errorMessage: error.message,
        });
        if (attempt < MAX_RETRIES) {
          this.logger.warn(
            `parseResume 第 ${attempt + 1} 次失败，${MAX_RETRIES - attempt} 次重试剩余: ${error.message}`,
          );
          await this.sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
        }
      }
    }

    throw new BadRequestException(
      `简历解析失败，已重试 ${MAX_RETRIES} 次: ${lastError?.message || '未知错误'}`,
    );
  }

  /**
   * 获取简历生成记录
   */
  async getResumeRecords(userId: string, query: GetResumeRecordsDto) {
    try {
      const { page = 1, pageSize = 10 } = query;
      const skip = (page - 1) * pageSize;
      const [total, list] = await Promise.all([
        this.resumeAiModel.countDocuments({ userId }),
        this.resumeAiModel
          .find({ userId })
          .select('-__v -resumeContent -generatedResumeDescription -detailInfo')
          .skip(skip)
          .limit(pageSize)
          .sort({ createdAt: -1 })
          .lean(),
      ]);
      return { total, list: list.map(toResumeRecordResponse) };
    } catch (error: any) {
      throw new BadRequestException(error.message);
    }
  }

  /**
   * 校验 JD - 通用版本，支持中英文混合、全岗位类型
   * @param jobDescription 岗位描述
   * @param language 返回消息的语言 ('CN' | 'EN')，默认 'CN'
   */
  validateJobDescription(
    jobDescription: string,
    language: 'CN' | 'EN' = 'CN',
  ): { isValid: boolean; reason: string; errors: string[]; score: number } {
    const errors: string[] = [];
    const messages = VALIDATION_MESSAGES[language];
    let score = 0;

    const length = jobDescription.length;

    if (length > MAX_LENGTH) {
      errors.push(messages.tooLong);
      return {
        isValid: false,
        reason: messages.tooLong,
        errors,
        score: 0,
      };
    }

    const chineseCharCount = (jobDescription.match(/[\u4e00-\u9fa5]/g) || [])
      .length;
    const isChineseDominant = chineseCharCount > length * 0.3;
    const effectiveMinLength = isChineseDominant
      ? MIN_CHINESE_LENGTH
      : MIN_ENGLISH_LENGTH;

    if (length < effectiveMinLength) {
      errors.push(messages.tooShort);
    } else {
      score += 20;
    }

    const paragraphs = jobDescription
      .split(/\n\s*\n/)
      .filter((p) => p.trim().length > 0);
    const lineBreaks = (jobDescription.match(/\n/g) || []).length;

    if (paragraphs.length < MIN_PARAGRAPHS && lineBreaks < MIN_LINE_BREAKS) {
      errors.push(messages.insufficientParagraphs);
    } else {
      score += 15;
    }

    let matchedGroups = 0;
    const matchedGroupNames: string[] = [];

    for (const group of JD_KEYWORD_GROUPS) {
      if (matchKeywordGroup(jobDescription, group)) {
        matchedGroups++;
        matchedGroupNames.push(group.name);
      }
    }

    if (matchedGroups >= JD_REQUIRED_KEYWORD_COUNT) {
      score += Math.min(matchedGroups * 8, 50);
    } else {
      errors.push(messages.missingKeywords);
    }

    let hasDiscriminatoryContent = false;
    const lowerJD = jobDescription.toLowerCase();

    for (const term of PROHIBITED_TERMS) {
      if (lowerJD.includes(term.toLowerCase())) {
        hasDiscriminatoryContent = true;
        break;
      }
    }

    if (!hasDiscriminatoryContent) {
      score += 15;
    } else {
      errors.push(messages.discriminatoryContent);
    }

    const isValid =
      errors.length === 0 &&
      matchedGroups >= JD_REQUIRED_KEYWORD_COUNT &&
      !hasDiscriminatoryContent;

    const reason = isValid
      ? language === 'CN'
        ? 'JD校验通过'
        : 'Job description validation passed'
      : errors[0] || 'Unknown error';

    return {
      isValid,
      reason,
      errors,
      score,
    };
  }

  /**
   * 校验简历内容 - 判断是否为有效的简历文档
   * @param resumeContent 简历内容
   * @param language 返回消息的语言 ('CN' | 'EN')，默认 'CN'
   */
  validateResumeContent(
    resumeContent: string,
    language: 'CN' | 'EN' = 'CN',
  ): ValidationResult {
    const errors: string[] = [];
    const messages = RESUME_VALIDATION_MESSAGES[language];
    let score = 0;

    // 归一化 CJK 文本，移除中文字符间的排版空白（如 "电 \t话" → "电话"）
    // 解决简历中因空格/Tab 对齐导致的关键词匹配失败
    const normalizedContent = normalizeCjkText(resumeContent);

    const details: ValidationDetails = {
      hasPersonalInfo: false,
      hasEducation: false,
      hasWorkExperience: false,
      hasSkills: false,
      hasProject: false,
      hasSelfEvaluation: false,
      hasTimeFormat: false,
      hasContactInfo: false,
      matchedKeywordGroups: [],
      contentLength: normalizedContent.length,
      paragraphCount: 0,
      lineBreakCount: 0,
      dateCount: 0,
    };

    const length = normalizedContent.length;

    if (length > RESUME_MAX_LENGTH) {
      errors.push(messages.tooLong);
      return {
        isValid: false,
        reason: messages.tooLong,
        errors,
        score: 0,
        details,
      };
    }

    if (length < RESUME_MIN_LENGTH) {
      errors.push(messages.tooShort);
    } else {
      score += 15;
    }

    const paragraphs = normalizedContent
      .split(/\n\s*\n/)
      .filter((p) => p.trim().length > 0);
    const lineBreaks = (normalizedContent.match(/\n/g) || []).length;

    details.paragraphCount = paragraphs.length;
    details.lineBreakCount = lineBreaks;

    if (
      paragraphs.length < RESUME_MIN_PARAGRAPHS &&
      lineBreaks < RESUME_MIN_LINE_BREAKS
    ) {
      errors.push(messages.insufficientStructure);
    } else {
      score += 15;
    }

    const dateCount = countDatePatterns(normalizedContent);
    details.dateCount = dateCount;

    if (dateCount >= RESUME_MIN_DATE_COUNT) {
      details.hasTimeFormat = true;
      score += 10;
    } else {
      errors.push(messages.missingTimeFormat);
    }

    details.hasContactInfo = hasContactInfo(normalizedContent);

    let matchedGroups = 0;

    for (const group of RESUME_KEYWORD_GROUPS) {
      if (matchResumeKeywordGroup(normalizedContent, group)) {
        matchedGroups++;
        details.matchedKeywordGroups.push(group.name);

        switch (group.name) {
          case 'personalInfo':
            details.hasPersonalInfo = true;
            if (details.hasContactInfo) {
              score += 20;
            } else {
              score += 10;
            }
            break;
          case 'education':
            details.hasEducation = true;
            score += 15;
            break;
          case 'workExperience':
            details.hasWorkExperience = true;
            score += 15;
            break;
          case 'skills':
            details.hasSkills = true;
            score += 10;
            break;
          case 'project':
            details.hasProject = true;
            score += 5;
            break;
          case 'selfEvaluation':
            details.hasSelfEvaluation = true;
            score += 5;
            break;
        }
      }
    }

    if (matchedGroups < RESUME_REQUIRED_KEYWORD_GROUPS) {
      if (!details.hasPersonalInfo) {
        errors.push(messages.missingPersonalInfo);
      }
      if (!details.hasEducation) {
        errors.push(messages.missingEducation);
      }
      if (!details.hasWorkExperience) {
        errors.push(messages.missingWorkExperience);
      }
      if (!details.hasSkills) {
        errors.push(messages.missingSkills);
      }
    }

    if (hasNonResumeContent(normalizedContent)) {
      errors.push(messages.nonResumeContent);
      score = Math.max(0, score - 30);
    }

    const hasAllRequiredFields = REQUIRED_KEYWORD_GROUPS.every(
      (requiredGroup) => details.matchedKeywordGroups.includes(requiredGroup),
    );

    if (!hasAllRequiredFields) {
      errors.push(messages.missingRequiredFields);
    }

    const isValid =
      score >= RESUME_PASSING_SCORE &&
      !hasNonResumeContent(normalizedContent) &&
      hasAllRequiredFields;

    const reason = isValid
      ? language === 'CN'
        ? '简历内容校验通过'
        : 'Resume content validation passed'
      : errors[0] || messages.invalidContent;

    return {
      isValid,
      reason,
      errors,
      score,
      details,
    };
  }

  /**
   * SSE生成简历
   * 使用Server-Sent Events实时推送简历生成进度
   */
  generateResumeSse(
    createAiResuemDto: CreateAiResuemDto,
    userId: string,
  ): Observable<SseMessage> {
    const { jobDescription } = createAiResuemDto;
    const { isValid, reason } = this.validateJobDescription(jobDescription);

    if (!isValid) {
      throw new BadRequestException(reason);
    }

    // 解析本次需要生成的模块（缺省/空数组 = 全部；非法 key 过滤）
    // Select 场景未选模块可从原简历继承，不做依赖补全，保持用户选择
    const modules = this.resolveModules(
      createAiResuemDto.modules,
      createAiResuemDto.parseType === ResumeAiTypeEnum.Select,
    );

    // 创建SSE消息Subject
    const sseSubject = new Subject<SseMessage>();
    const stopSignal = new Subject<void>();

    // 配置参数
    const retryConfig: RetryConfig = {
      maxRetries: 3,
      retryDelay: 1000,
      backoffFactor: 2,
    };

    const heartbeatConfig: HeartbeatConfig = {
      interval: 30000, // 30秒
      timeout: 60000, // 60秒
    };

    // 启动心跳机制
    this.startHeartbeat(sseSubject, heartbeatConfig, stopSignal);

    // 根据解析类型处理
    this.processResumeGeneration(
      createAiResuemDto,
      userId,
      sseSubject,
      stopSignal,
      retryConfig,
      modules,
    ).catch((error: any) => {
      this.logger.error('简历生成失败', error?.stack);
      // 发送错误消息
      const errorMessage: SseMessage = {
        type: 'error',
        moduleName: 'system',
        status: 'failed',
        message: error?.message || '简历生成失败',
        totalModules: modules.length,
        currentModule: 0,
        resumeId: error?.resumeId,
      };
      sseSubject.next(errorMessage);
      // 业务失败已通过 next 推送完整 error 消息（含 resumeId），
      // 这里用 complete 正常结束流，避免再触发控制器 error 处理器写出第二帧丢失 resumeId。
      sseSubject.complete();
      stopSignal.next();
      stopSignal.complete();
    });

    return sseSubject.asObservable().pipe(
      takeUntil(stopSignal),
      catchError((error) => {
        this.logger.error('SSE连接错误', (error as Error).stack);
        return throwError(() => error);
      }),
    );
  }

  /**
   * 处理简历生成流程
   */
  private async processResumeGeneration(
    createAiResuemDto: CreateAiResuemDto,
    userId: string,
    sseSubject: Subject<SseMessage>,
    stopSignal: Subject<void>,
    retryConfig: RetryConfig,
    modules: string[],
  ): Promise<void> {
    const { parseType, jobDescription } = createAiResuemDto;

    // 获取简历内容；Select 场景保留原简历，用于未选模块数据继承
    let sourceResume: Record<string, any> | undefined;
    let resumeContent = '';
    switch (parseType) {
      case ResumeAiTypeEnum.Manual: {
        resumeContent = this.parseSupplementary(createAiResuemDto.detailInfo!);
        break;
      }
      case ResumeAiTypeEnum.Upload: {
        resumeContent = createAiResuemDto.resumeContent!;
        break;
      }
      case ResumeAiTypeEnum.Select: {
        const resume = await this.resumeModel.findOne({
          _id: createAiResuemDto.resumeId,
          userId,
        });
        if (!resume) {
          throw new BadRequestException('不存在该简历');
        }
        sourceResume = resume.toObject();
        resumeContent = this.parseSupplementary(sourceResume);
        break;
      }
      default:
        throw new BadRequestException('Invalid resume type');
    }

    // 验证简历内容
    const { isValid, reason } = this.validateResumeContent(resumeContent);
    if (!isValid) {
      throw new BadRequestException(reason);
    }

    // 创建数据库记录
    const record = await this.createRecord(userId, {
      ...createAiResuemDto,
      resumeContent,
    });

    const aiStartTime = Date.now();
    let resumeId: string | undefined;

    try {
      // 草稿先行：生成开始前创建简历草稿，前端可立即进入编辑页
      const draftData = {
        ...this.buildDraftData(sourceResume),
        title: this.buildAiResumeTitle(createAiResuemDto, sourceResume),
      };
      const draft = await this.createResume(
        draftData as CreateResumeDto,
        record.templateType,
        userId,
        'generating',
      );
      resumeId = draft._id.toString();

      // 保存生成的简历ID（草稿）
      record.generatedResumeId = resumeId;
      await record.save();

      // 推送 init 消息，前端据此跳转编辑页
      this.sendInit(sseSubject, modules.length, resumeId);

      // 执行所选模块（完成后逐模块推送数据并增量落库）
      await this.executeAllModules(
        jobDescription,
        resumeContent,
        sseSubject,
        retryConfig,
        modules,
        resumeId,
      );

      // 最终草稿结构校验（仅告警，不阻断）
      const finalDraft = await this.resumeModel.findById(resumeId).lean();
      const parsed = ResumeSchema.safeParse(finalDraft ?? draftData);
      if (!parsed.success) {
        this.logger.warn(
          `SSE 草稿最终校验失败: ${parsed.error.message}，继续完成`,
        );
      }

      // 标记草稿完成
      await this.resumeModel.findByIdAndUpdate(resumeId, {
        $set: { aiStatus: 'completed' },
      });

      // 更新记录状态
      await this.updateRecordStatus(
        record._id.toString(),
        ResumeAiStatusEnum.Completed,
      );

      this.recordAiUsage({
        userId,
        aiFunction: AiFunctionEnum.ResumeGeneration,
        success: true,
        duration: Date.now() - aiStartTime,
        resumeId,
        metadata: { parseType, moduleCount: modules.length },
      });

      // 发送完成消息（type: 'complete'，携带 resumeId）
      this.sendComplete(sseSubject, modules.length, modules.length, resumeId);

      // 关闭连接
      stopSignal.next();
      stopSignal.complete();
      sseSubject.complete();
    } catch (error) {
      this.recordAiUsage({
        userId,
        aiFunction: AiFunctionEnum.ResumeGeneration,
        success: false,
        duration: Date.now() - aiStartTime,
        errorMessage: error.message,
        metadata: { parseType },
      });
      // 标记草稿失败（保留已生成模块）
      if (resumeId) {
        await this.resumeModel
          .findByIdAndUpdate(resumeId, { $set: { aiStatus: 'failed' } })
          .catch((err) =>
            this.logger.warn('标记草稿失败状态异常', (err as Error).message),
          );
      }
      // 更新记录状态为失败
      await this.updateRecordStatus(
        record._id.toString(),
        ResumeAiStatusEnum.Failed,
      );
      // 携带 resumeId 供外层 error 消息使用
      throw Object.assign(error, { resumeId });
    }
  }

  /**
   * 执行所有模块
   */
  private async executeAllModules(
    jobDescription: string,
    resumeContent: string,
    sseSubject: Subject<SseMessage>,
    retryConfig: RetryConfig,
    modules: string[],
    resumeId: string,
  ): Promise<ModuleResult[]> {
    const results: ModuleResult[] = [];
    const current = formatDate();
    const moduleLabelMap = new Map(MODULE_EXECUTION_ORDER);

    for (let i = 0; i < modules.length; i++) {
      const moduleName = modules[i] as ModuleName;
      const moduleLabel = moduleLabelMap.get(moduleName) ?? moduleName;
      const moduleConfig = MODULE_PROMPTS[moduleName];

      // 发送开始处理消息
      this.sendProgress(
        sseSubject,
        moduleName,
        'processing',
        i + 1,
        modules.length,
        `正在处理${moduleLabel}模块`,
      );

      // 执行模块（带重试）
      const result = await this.executeModuleWithRetry(
        moduleName,
        moduleConfig.prompt,
        jobDescription,
        resumeContent,
        current,
        retryConfig,
        sseSubject,
      );

      results.push(result);

      // 发送完成消息
      if (result.success) {
        // AI 返回的模块 JSON 通常自带模块 key（如 { workExperience: [...] }），
        // 解包后推送/落库，与简历字段结构保持一致
        const moduleData = result.data?.[moduleName] ?? result.data;
        this.sendProgress(
          sseSubject,
          moduleName,
          'completed',
          i + 1,
          modules.length,
          `${moduleName}模块处理完成`,
          undefined,
          resumeId,
          moduleData,
        );
        await this.updateDraftModule(resumeId, moduleName, moduleData);
      } else {
        throw new BadRequestException(
          `模块${moduleName}执行失败: ${result.error}`,
        );
      }
    }

    return results;
  }

  /**
   * 执行单个模块（带重试机制）
   */
  private async executeModuleWithRetry(
    moduleName: string,
    prompt: string,
    jobDescription: string,
    resumeContent: string,
    currentDate: string,
    retryConfig: RetryConfig,
    sseSubject: Subject<SseMessage>,
  ): Promise<ModuleResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retryConfig.maxRetries; attempt++) {
      try {
        const data = await this.callAiForModule(
          prompt,
          jobDescription,
          resumeContent,
          currentDate,
        );

        return {
          moduleName,
          data,
          success: true,
          retryCount: attempt,
        };
      } catch (error: any) {
        lastError = error;

        if (attempt < retryConfig.maxRetries - 1) {
          // 发送重试消息
          this.sendProgress(
            sseSubject,
            moduleName,
            'retrying',
            0,
            0,
            `${moduleName}模块重试中 (${attempt + 1}/${retryConfig.maxRetries})`,
            attempt + 1,
          );

          // 计算退避延迟
          const delayTime =
            retryConfig.retryDelay *
            Math.pow(retryConfig.backoffFactor, attempt);
          await this.sleep(delayTime);
        }
      }
    }

    // 所有重试都失败
    return {
      moduleName,
      data: null,
      success: false,
      retryCount: retryConfig.maxRetries,
      error: lastError?.message || '未知错误',
    };
  }

  /**
   * 调用AI模型生成单个模块数据
   */
  private async callAiForModule(
    prompt: string,
    jobDescription: string,
    resumeContent: string,
    currentDate: string,
  ): Promise<any> {
    try {
      // 设置超时时间为60秒
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('AI调用超时')), 60000);
      });

      const aiCallPromise = this.executeAiCall(
        prompt,
        jobDescription,
        resumeContent,
        currentDate,
      );

      // 使用Promise.race实现超时控制
      const result = await Promise.race([aiCallPromise, timeoutPromise]);
      return result;
    } catch (error: any) {
      this.logger.error(`AI调用失败: ${error.message}`, error.stack);
      throw new BadRequestException('AI调用失败');
    }
  }

  /**
   * 执行AI调用
   */
  private async executeAiCall(
    prompt: string,
    jobDescription: string,
    resumeContent: string,
    currentDate: string,
  ): Promise<any> {
    const promptTemplate = PromptTemplate.fromTemplate(prompt);
    const model = this.aiService.generateResume();
    const parser = new JsonOutputParser();
    const chain = promptTemplate.pipe(model).pipe(parser);

    const res = await chain.invoke({
      jd: jobDescription,
      experience: resumeContent,
      current_date: currentDate,
    });

    return res;
  }

  /**
   * 解析本次需要生成的模块列表
   * 缺省或空数组时默认全部模块；非法 key 静默过滤；过滤后为空则抛错。
   * 结果顺序固定为后端模块执行顺序，不随入参顺序变化。
   *
   * Upload/Manual 场景（inheritUnselected=false）没有原简历可继承，
   * 会按 MODULE_PROMPTS 声明的依赖做传递闭包补全，并始终包含 basicInfo，
   * 保证聚合结果满足 ResumeSchema；
   * Select 场景（inheritUnselected=true）未选模块数据从原简历继承，保持用户选择不变。
   */
  private resolveModules(
    modules?: string[],
    inheritUnselected = false,
  ): string[] {
    const allModuleKeys = MODULE_EXECUTION_ORDER.map(([name]) => name);
    if (!modules || modules.length === 0) {
      return [...allModuleKeys];
    }

    const selected = new Set(modules);
    let resolved: string[] = allModuleKeys.filter((name) => selected.has(name));
    if (resolved.length === 0) {
      throw new BadRequestException('至少选择一个有效的生成模块');
    }
    if (!inheritUnselected) {
      resolved = this.withDependencies(resolved);
    }
    return resolved;
  }

  /**
   * 按 MODULE_PROMPTS 声明的依赖做传递闭包补全，并始终包含 basicInfo
   */
  private withDependencies(selected: string[]): string[] {
    const allModuleKeys = MODULE_EXECUTION_ORDER.map(([name]) => name);
    const result = new Set(selected);

    let changed = true;
    while (changed) {
      changed = false;
      for (const name of [...result]) {
        const deps = MODULE_PROMPTS[name as ModuleName]?.dependencies ?? [];
        for (const dep of deps) {
          if (!result.has(dep)) {
            result.add(dep);
            changed = true;
          }
        }
      }
    }

    // ResumeSchema 中 basicInfo 为必填，生成新简历时始终包含
    result.add('basicInfo');

    return allModuleKeys.filter((name) => result.has(name));
  }

  /**
   * 发送SSE进度消息
   */
  private sendProgress(
    sseSubject: Subject<SseMessage>,
    moduleName: string,
    status: 'processing' | 'completed' | 'failed' | 'retrying',
    currentModule: number,
    totalModules: number,
    message?: string,
    retryCount?: number,
    resumeId?: string,
    data?: any,
  ): void {
    const sseMessage: SseMessage = {
      type: 'progress',
      moduleName,
      status,
      message,
      retryCount,
      totalModules,
      currentModule,
      resumeId,
      data,
    };

    sseSubject.next(sseMessage);
  }

  /**
   * 发送SSE初始化消息
   * 草稿简历创建成功后推送，前端据此立即进入编辑页
   */
  private sendInit(
    sseSubject: Subject<SseMessage>,
    totalModules: number,
    resumeId: string,
  ): void {
    const sseMessage: SseMessage = {
      type: 'init',
      moduleName: 'system',
      status: 'started',
      totalModules,
      currentModule: 0,
      resumeId,
    };

    sseSubject.next(sseMessage);
  }

  /**
   * 发送SSE完成消息
   * 完整流程结束时推送 type: 'complete' 消息，携带生成的简历ID
   */
  private sendComplete(
    sseSubject: Subject<SseMessage>,
    totalModules: number,
    currentModule: number,
    resumeId: string,
    message = '简历生成完成',
  ): void {
    const sseMessage: SseMessage = {
      type: 'complete',
      moduleName: 'complete',
      status: 'completed',
      message,
      totalModules,
      currentModule,
      resumeId,
    };

    sseSubject.next(sseMessage);
  }

  /**
   * 启动心跳机制
   */
  private startHeartbeat(
    sseSubject: Subject<SseMessage>,
    heartbeatConfig: HeartbeatConfig,
    stopSignal: Subject<void>,
  ): void {
    interval(heartbeatConfig.interval)
      .pipe(takeUntil(stopSignal))
      .subscribe(() => {
        const heartbeatMessage: SseMessage = {
          type: 'heartbeat',
          moduleName: 'system',
          status: 'processing',
          totalModules: 0,
          currentModule: 0,
          message: 'heartbeat',
        };
        sseSubject.next(heartbeatMessage);
      });
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==================== AI润色模块 ====================

  /**
   * 可润色的对象模块key（无需index）
   */
  private static readonly OBJECT_POLISH_KEYS = [
    'skills',
    'certificates',
    'selfEvaluation',
  ];

  /**
   * 可润色的数组模块key（需要index）
   */
  private static readonly ARRAY_POLISH_KEYS = [
    'educationBackground',
    'workExperience',
    'campusExperience',
    'projectExperience',
    'internshipExperience',
  ];

  /**
   * 所有支持的模块key
   */
  private static readonly ALL_POLISH_KEYS = [
    ...ResumeAiService.OBJECT_POLISH_KEYS,
    ...ResumeAiService.ARRAY_POLISH_KEYS,
  ];

  /**
   * 每个模块中可润色的文本字段
   */
  private static readonly POLISHABLE_FIELDS: Record<string, string[]> = {
    skills: ['content'],
    certificates: ['content'],
    selfEvaluation: ['content'],
    educationBackground: ['content'],
    workExperience: ['workDescription'],
    campusExperience: ['content'],
    projectExperience: ['content'],
    internshipExperience: ['description'],
  };

  /**
   * AI润色简历模块内容
   */
  async polishContent(polishResumeDto: PolishResumeDto, userId: string) {
    const { resumeId, key, index: rawIndex, description } = polishResumeDto;

    if (!ResumeAiService.ALL_POLISH_KEYS.includes(key)) {
      throw new BadRequestException(`不支持的模块key: ${key}`);
    }

    const isObjectModule = ResumeAiService.OBJECT_POLISH_KEYS.includes(key);
    const isArrayModule = ResumeAiService.ARRAY_POLISH_KEYS.includes(key);

    if (isArrayModule && rawIndex === undefined) {
      throw new BadRequestException('数组模块必须提供index参数');
    }
    if (isObjectModule && rawIndex !== undefined) {
      throw new BadRequestException('对象模块不应提供index参数');
    }
    const index = rawIndex!;

    const selectFields = isArrayModule ? key : `${key}.content`;
    const resume = await this.resumeModel
      .findOne({ _id: resumeId, userId })
      .select(selectFields)
      .lean();
    if (!resume) {
      throw new BadRequestException('简历不存在');
    }

    let beforeContent: string;
    if (isArrayModule) {
      const arr = resume[key] as any[];
      if (!arr || index >= arr.length || index < 0) {
        throw new BadRequestException(
          `index超出范围，该模块共有${arr?.length || 0}条记录`,
        );
      }
      const item = arr[index];
      const textFields = ResumeAiService.POLISHABLE_FIELDS[key];
      // 取第一个文本字段作为代表
      beforeContent = item[textFields[0]] || '';
    } else {
      const obj = resume[key] as any;
      beforeContent = obj?.content || '';
    }

    if (!beforeContent || !beforeContent.trim()) {
      throw new BadRequestException('该内容为空，无需润色');
    }

    const promptTemplate = PromptTemplate.fromTemplate(polishContentPrompt);
    const model = this.aiService.generateResume();
    const parser = this.aiService.createStructuredParser(
      z.record(z.string(), z.string()),
    );
    const chain = promptTemplate.pipe(model).pipe(parser);

    let aiResult: Record<string, string>;
    const aiStartTime = Date.now();
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('AI润色超时')), 60000);
      });
      aiResult = (await Promise.race([
        chain.invoke({
          current_content: JSON.stringify(
            isArrayModule ? (resume[key] as any[])[index] : resume[key],
            null,
            2,
          ),
          module_key: key,
          description: description || '请对内容进行通用润色优化',
          current_date: formatDate(),
        }),
        timeoutPromise,
      ])) as Record<string, string>;
    } catch (error: any) {
      this.recordAiUsage({
        userId,
        aiFunction: AiFunctionEnum.ModuleOptimization,
        success: false,
        duration: Date.now() - aiStartTime,
        errorMessage: error.message,
        resumeId,
        metadata: { polishKey: key },
      });
      throw new BadRequestException('AI润色失败: ' + error.message);
    }

    if (!aiResult || Object.keys(aiResult).length === 0) {
      throw new BadRequestException('AI润色结果为空，请重试');
    }

    if (isArrayModule) {
      const updateFields: Record<string, any> = {};
      for (const [fieldKey, fieldValue] of Object.entries(aiResult)) {
        updateFields[`${key}.${index}.${fieldKey}`] = fieldValue;
      }
      await this.resumeModel.findByIdAndUpdate(resumeId, updateFields);
    } else {
      // 对象模块，取第一个文本字段的值
      const textFields = ResumeAiService.POLISHABLE_FIELDS[key];
      const fieldKey = textFields[0];
      const polishedValue = aiResult[fieldKey] || aiResult.content;
      await this.resumeModel.findByIdAndUpdate(resumeId, {
        [`${key}.${fieldKey}`]: polishedValue,
      });
    }

    let finalAfterContent: string;
    if (isArrayModule) {
      const textFields = ResumeAiService.POLISHABLE_FIELDS[key];
      finalAfterContent = aiResult[textFields[0]] || '';
    } else {
      const textFields = ResumeAiService.POLISHABLE_FIELDS[key];
      finalAfterContent = aiResult[textFields[0]] || aiResult.content || '';
    }

    const record = await this.editRecordModel.create({
      resumeId,
      editKey: key,
      editIndex: isArrayModule ? index : null,
      beforeContent,
      afterContent: finalAfterContent,
      userId,
    });

    this.recordAiUsage({
      userId,
      aiFunction: AiFunctionEnum.ModuleOptimization,
      success: true,
      duration: Date.now() - aiStartTime,
      resumeId,
      metadata: {
        polishKey: key,
        editIndex: isArrayModule ? index : undefined,
      },
    });

    return {
      recordId: record._id,
      beforeContent,
      afterContent: finalAfterContent,
    };
  }

  /**
   * 撤销AI润色操作
   */
  async undoEdit(undoEditDto: UndoEditDto, userId: string) {
    const { recordId, resumeId } = undoEditDto;

    const record = await this.editRecordModel.findOne({
      _id: recordId,
      resumeId,
      userId,
    });
    if (!record) {
      throw new BadRequestException('编辑记录不存在或无权操作');
    }

    // 恢复原始内容
    const { editKey, editIndex, beforeContent } = record;
    if (editIndex !== null) {
      // 数组模块
      await this.resumeModel.findByIdAndUpdate(resumeId, {
        [`${editKey}.${editIndex}.${ResumeAiService.POLISHABLE_FIELDS[editKey][0]}`]:
          beforeContent,
      });
    } else {
      // 对象模块
      const textFields = ResumeAiService.POLISHABLE_FIELDS[editKey];
      await this.resumeModel.findByIdAndUpdate(resumeId, {
        [`${editKey}.${textFields[0]}`]: beforeContent,
      });
    }

    await this.editRecordModel.findByIdAndDelete(recordId);

    return { success: true, restoredContent: beforeContent };
  }

  /**
   * AI分析简历与岗位JD的匹配度（带自动重试 + 输入截断 + 挂起任务恢复）
   */
  async analyzeResume(analyzeResumeDto: AnalyzeResumeDto, userId: string) {
    const MAX_RETRIES = 2;
    const RETRY_DELAY_MS = 1500;
    const STUCK_TASK_TIMEOUT_MS = 5 * 60 * 1000;

    const { resumeId, jobDescription } = analyzeResumeDto;

    // 校验 JD 内容
    const { isValid, reason } = this.validateJobDescription(jobDescription);
    if (!isValid) {
      throw new BadRequestException(reason);
    }

    // 恢复超过 5 分钟的挂起分析任务
    const stuckThreshold = new Date(Date.now() - STUCK_TASK_TIMEOUT_MS);
    await this.analysisRecordModel.updateMany(
      {
        userId,
        status: AnalysisStatusEnum.Analyzing,
        createdAt: { $lt: stuckThreshold },
      },
      { status: AnalysisStatusEnum.Failed, failReason: '任务超时自动恢复' },
    );

    // 检查是否有正在进行的分析
    const existingAnalysis = await this.analysisRecordModel.findOne({
      userId,
      status: AnalysisStatusEnum.Analyzing,
    });
    if (existingAnalysis) {
      throw new BadRequestException('存在正在分析的任务，请稍后重试');
    }

    // 查询简历
    const resume = await this.resumeModel
      .findOne({ _id: resumeId, userId })
      .lean();
    if (!resume) {
      throw new BadRequestException('简历不存在');
    }

    // 创建分析记录
    const record = await this.analysisRecordModel.create({
      resumeId,
      jobDescription,
      status: AnalysisStatusEnum.Analyzing,
      userId,
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const aiStartTime = Date.now();
      try {
        // 最后一次兜底尝试收紧输入预算，前两次使用常规预算
        const inputBudget =
          attempt === MAX_RETRIES
            ? ANALYSIS_INPUT_BUDGET_FALLBACK
            : ANALYSIS_INPUT_BUDGET;
        const { resumeContent, jobDescription: truncatedJd } =
          buildTruncatedAnalysisContext(resume, jobDescription, inputBudget);

        const promptTemplate = PromptTemplate.fromTemplate(analyzeResumePrompt);
        // 第一次用配置的思考模式（默认 low），超时重试时强制关闭思考
        const model =
          attempt === 0
            ? this.aiService.generateAnalyzeResume()
            : this.aiService.generateAnalyzeResume('disabled');
        const parser =
          this.aiService.createRobustStructuredParser(AnalysisSchema);
        const chain = promptTemplate.pipe(model).pipe(parser);

        const controller = new AbortController();
        const timeoutTimer = setTimeout(
          () => controller.abort(),
          ANALYSIS_TIMEOUT_MS,
        );

        let aiResult: Record<string, any>;
        try {
          const parsed = await chain.invoke(
            {
              jd: truncatedJd,
              experience: resumeContent,
              current_date: formatDate(),
            },
            { signal: controller.signal },
          );
          aiResult = normalizeAnalysisResult(parsed);
        } catch (error: any) {
          if (controller.signal.aborted) {
            throw new Error('AI分析超时');
          }
          throw error;
        } finally {
          clearTimeout(timeoutTimer);
        }

        const aiDuration = Date.now() - aiStartTime;

        if (!aiResult || Object.keys(aiResult).length === 0) {
          throw new BadRequestException('AI分析结果为空');
        }

        await this.analysisRecordModel.findByIdAndUpdate(record._id, {
          status: AnalysisStatusEnum.Completed,
          analysisResult: aiResult,
        });

        this.recordAiUsage({
          userId,
          aiFunction: AiFunctionEnum.ResumeAnalysis,
          success: true,
          duration: aiDuration,
          resumeId,
          metadata: { analysisRecordId: record._id.toString() },
        });

        return {
          recordId: record._id,
          analysisResult: aiResult,
        };
      } catch (error: any) {
        lastError = error;
        this.recordAiUsage({
          userId,
          aiFunction: AiFunctionEnum.ResumeAnalysis,
          success: false,
          duration: Date.now() - aiStartTime,
          errorMessage: error.message,
          resumeId,
          metadata: { analysisRecordId: record._id.toString() },
        });

        if (attempt < MAX_RETRIES) {
          this.logger.warn(
            `analyzeResume 第 ${attempt + 1} 次失败，${MAX_RETRIES - attempt} 次重试剩余: ${error.message}`,
          );
          await this.sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
        }
      }
    }

    // 所有重试均失败
    try {
      await this.analysisRecordModel.findByIdAndUpdate(record._id, {
        status: AnalysisStatusEnum.Failed,
        failReason: lastError?.message || '未知错误',
      });
    } catch {
      // 状态更新失败不影响错误抛出
    }
    this.logger.error(`AI分析失败，已重试 ${MAX_RETRIES} 次`, lastError?.stack);
    throw new BadRequestException(
      `AI分析失败，已重试 ${MAX_RETRIES} 次: ${lastError?.message || '未知错误'}`,
    );
  }

  /**
   * 获取用户的简历分析记录列表
   */
  async getAnalysisRecords(userId: string, page = 1, pageSize = 10) {
    const skip = (page - 1) * pageSize;
    const [records, total] = await Promise.all([
      this.analysisRecordModel
        .find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      this.analysisRecordModel.countDocuments({ userId }),
    ]);

    return {
      list: records,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
  /**
   * 获取用户的简历分析详情
   */
  async getAnalysisDetailService(id: string, userId: string) {
    const data = await this.analysisRecordModel
      .findOne({ _id: id, userId })
      .select('-__v')
      .lean();
    if (!data) {
      throw new BadRequestException('查询不到对应的分析数据');
    }
    return data;
  }

  async getLatestAnalysisByResumeId(resumeId: string, userId: string) {
    const data = await this.analysisRecordModel
      .findOne({ resumeId, userId })
      .sort({ createdAt: -1 })
      .select('-__v')
      .lean();
    return data;
  }

  /**
   * AI面试押题（带自动重试 + 输入截断 + 挂起任务恢复 + 数量/字数校验）
   */
  async predictInterviewQuestions(
    predictQuestionsDto: PredictQuestionsDto,
    userId: string,
  ) {
    const MAX_RETRIES = 2;
    const RETRY_DELAY_MS = 1500;
    const STUCK_TASK_TIMEOUT_MS = 5 * 60 * 1000;

    const { resumeId, jobDescription, questionCount } = predictQuestionsDto;

    // 服务层兜底校验（DTO 管道已校验，此处防止绕过管道直接调用）
    if (
      !Number.isInteger(questionCount) ||
      questionCount < QUESTION_COUNT_MIN ||
      questionCount > QUESTION_COUNT_MAX
    ) {
      throw new BadRequestException(
        `题目数量必须在 ${QUESTION_COUNT_MIN}-${QUESTION_COUNT_MAX} 之间`,
      );
    }

    // 校验 JD 内容
    const { isValid, reason } = this.validateJobDescription(jobDescription);
    if (!isValid) {
      throw new BadRequestException(reason);
    }

    // 恢复超过 5 分钟的挂起押题任务
    const stuckThreshold = new Date(Date.now() - STUCK_TASK_TIMEOUT_MS);
    await this.questionRecordModel.updateMany(
      {
        userId,
        status: QuestionStatusEnum.Generating,
        createdAt: { $lt: stuckThreshold },
      },
      { status: QuestionStatusEnum.Failed, failReason: '任务超时自动恢复' },
    );

    // 检查是否有正在进行的押题任务
    const existingRecord = await this.questionRecordModel.findOne({
      userId,
      status: QuestionStatusEnum.Generating,
    });
    if (existingRecord) {
      throw new BadRequestException('存在正在进行的押题任务，请稍后重试');
    }

    // 查询简历
    const resume = await this.resumeModel
      .findOne({ _id: resumeId, userId })
      .lean();
    if (!resume) {
      throw new BadRequestException('简历不存在');
    }
    const resumeDoc = resume as Record<string, any>;

    // 从简历提取求职岗位与工作年限（缺失时由模型从简历内容推断）
    const targetPosition =
      resumeDoc.jobIntention?.jobIntention?.trim() ??
      resumeDoc.jobIntention?.position?.trim() ??
      '';
    const workYears = resumeDoc.basicInfo?.workYear?.trim() ?? '';
    const candidateName = resumeDoc.basicInfo?.name?.trim() ?? '';

    // 创建押题记录
    const record = await this.questionRecordModel.create({
      resumeId,
      jobDescription,
      questionCount,
      candidateName,
      targetPosition,
      workYears,
      status: QuestionStatusEnum.Generating,
      userId,
    });

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const aiStartTime = Date.now();
      try {
        // 最后一次兜底尝试收紧输入预算，前两次使用常规预算
        const inputBudget =
          attempt === MAX_RETRIES
            ? ANALYSIS_INPUT_BUDGET_FALLBACK
            : ANALYSIS_INPUT_BUDGET;
        const { resumeContent, jobDescription: truncatedJd } =
          buildTruncatedAnalysisContext(resumeDoc, jobDescription, inputBudget);

        const promptTemplate = PromptTemplate.fromTemplate(
          interviewQuestionsPrompt,
        );
        const model = this.aiService.generateInterviewQuestions();
        const parser = this.aiService.createRobustStructuredParser(
          InterviewQuestionSchema,
        );
        const chain = promptTemplate.pipe(model).pipe(parser);

        const controller = new AbortController();
        const timeoutTimer = setTimeout(
          () => controller.abort(),
          ANALYSIS_TIMEOUT_MS,
        );

        let aiResult: Record<string, any>;
        try {
          const parsed = await chain.invoke(
            {
              jd: truncatedJd,
              experience: resumeContent,
              target_position:
                targetPosition || '（简历中未明确，请根据 JD 推断）',
              work_years: workYears || '（简历中未明确，请根据经历推断）',
              question_count: String(questionCount),
              current_date: formatDate(),
            },
            { signal: controller.signal },
          );
          aiResult = parsed as Record<string, any>;
        } catch (error: any) {
          if (controller.signal.aborted) {
            throw new Error('AI押题超时');
          }
          throw error;
        } finally {
          clearTimeout(timeoutTimer);
        }

        // 校验题目数量精确等于所选数量，且每题题目/解答非空、不超字数上限
        const normalized = normalizeInterviewQuestions(aiResult, questionCount);
        const { questions, overview, focusAreas, hotTopics, interviewTips } =
          normalized;
        const aiDuration = Date.now() - aiStartTime;

        await this.questionRecordModel.findByIdAndUpdate(record._id, {
          status: QuestionStatusEnum.Completed,
          result: questions,
          overview,
          focusAreas,
          hotTopics,
          interviewTips,
        });

        this.recordAiUsage({
          userId,
          aiFunction: AiFunctionEnum.InterviewQuestionPrediction,
          success: true,
          duration: aiDuration,
          resumeId,
          metadata: {
            questionRecordId: record._id.toString(),
            questionCount,
          },
        });

        return {
          recordId: record._id,
          result: questions,
          overview,
          focusAreas,
          hotTopics,
          interviewTips,
        };
      } catch (error: any) {
        lastError = error;
        this.recordAiUsage({
          userId,
          aiFunction: AiFunctionEnum.InterviewQuestionPrediction,
          success: false,
          duration: Date.now() - aiStartTime,
          errorMessage: error.message,
          resumeId,
          metadata: {
            questionRecordId: record._id.toString(),
            questionCount,
          },
        });

        if (attempt < MAX_RETRIES) {
          this.logger.warn(
            `predictInterviewQuestions 第 ${attempt + 1} 次失败，${MAX_RETRIES - attempt} 次重试剩余: ${error.message}`,
          );
          await this.sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
        }
      }
    }

    // 所有重试均失败
    try {
      await this.questionRecordModel.findByIdAndUpdate(record._id, {
        status: QuestionStatusEnum.Failed,
        failReason: lastError?.message || '未知错误',
      });
    } catch {
      // 状态更新失败不影响错误抛出
    }
    this.logger.error(`AI押题失败，已重试 ${MAX_RETRIES} 次`, lastError?.stack);
    throw new BadRequestException(
      `AI押题失败，已重试 ${MAX_RETRIES} 次: ${lastError?.message || '未知错误'}`,
    );
  }

  /**
   * 获取用户的押题记录列表（分页）
   */
  async getQuestionRecords(userId: string, page = 1, pageSize = 10) {
    const skip = (page - 1) * pageSize;
    const [records, total] = await Promise.all([
      this.questionRecordModel
        .find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      this.questionRecordModel.countDocuments({ userId }),
    ]);

    return {
      list: records,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取押题记录详情
   */
  async getQuestionDetailService(id: string, userId: string) {
    const data = await this.questionRecordModel
      .findOne({ _id: id, userId })
      .select('-__v')
      .lean();
    if (!data) {
      throw new BadRequestException('查询不到对应的押题数据');
    }
    return data;
  }

  /**
   * 获取简历最近一次的押题记录
   */
  async getLatestQuestionsByResumeId(resumeId: string, userId: string) {
    const data = await this.questionRecordModel
      .findOne({ resumeId, userId })
      .sort({ createdAt: -1 })
      .select('-__v')
      .lean();
    return data;
  }

  /**
   * 导出 AI 分析结果为 Markdown 格式
   * @param id 分析记录 ID
   * @param userId 用户 ID
   * @returns Markdown 字符串
   */
  async exportAnalysisMd(id: string, userId: string): Promise<string> {
    const record = await this.analysisRecordModel
      .findOne({ _id: id, userId })
      .select('-__v')
      .lean();

    if (!record) {
      throw new BadRequestException('分析记录不存在');
    }

    if (record.status !== AnalysisStatusEnum.Completed) {
      throw new BadRequestException('分析尚未完成，无法导出');
    }

    const a = record.analysisResult || {};
    const lines: string[] = [];

    // 标题
    lines.push('# 简历分析报告');
    lines.push('');

    // 基本信息
    const meta = a.meta || {};
    lines.push('## 基本信息');
    lines.push('');
    if (meta.candidate_name) lines.push(`- **候选人**：${meta.candidate_name}`);
    if (meta.target_position)
      lines.push(`- **目标岗位**：${meta.target_position}`);
    if (meta.analysis_date) lines.push(`- **分析日期**：${meta.analysis_date}`);
    lines.push(`- **目标 JD**：${record.jobDescription}`);
    lines.push('');

    // 综合评分
    const levelLabel: Record<string, string> = {
      excellent: '优秀',
      strong: '较强',
      moderate: '中等',
      weak: '较弱',
      poor: '较差',
    };
    lines.push('## 综合评分');
    lines.push('');
    lines.push(
      `**总分：${a.overall_score ?? '—'}/100**\u3000|\u3000竞争力等级：${levelLabel[a.competitiveness_level] || a.competitiveness_level || '—'}`,
    );
    lines.push('');

    // 各维度评分
    lines.push('## 各维度评分');
    lines.push('');
    const dimensions = a.dimension_scores || [];
    if (dimensions.length > 0) {
      lines.push('| 维度 | 得分 | 权重 | 评价 |');
      lines.push('|------|------|------|------|');
      for (const d of dimensions) {
        const pct = d.weight != null ? `${Math.round(d.weight * 100)}%` : '—';
        lines.push(
          `| ${d.name || '—'} | ${d.score ?? '—'}/${d.max ?? 100} | ${pct} | ${d.comment || '—'} |`,
        );
      }
    } else {
      lines.push('（暂无数据）');
    }
    lines.push('');

    // 优势亮点
    lines.push('## 优势亮点');
    lines.push('');
    const strengths = a.strengths || [];
    if (strengths.length > 0) {
      for (const s of strengths) {
        lines.push(`### ${s.title || '—'}`);
        lines.push(`- **分类**：${s.category || '—'}`);
        lines.push(`- ${s.description || '—'}`);
        lines.push('');
      }
    } else {
      lines.push('（暂无数据）');
      lines.push('');
    }

    // 待改进项
    lines.push('## 待改进项');
    lines.push('');
    const weaknesses = a.weaknesses || [];
    if (weaknesses.length > 0) {
      const severityLabel: Record<string, string> = {
        critical: '🔴 严重',
        major: '🟠 主要',
        minor: '🟡 次要',
      };
      for (const w of weaknesses) {
        lines.push(
          `### ${w.title || '—'} [${severityLabel[w.severity] || w.severity || '—'}]`,
        );
        lines.push(`- **分类**：${w.category || '—'}`);
        lines.push(`- **问题**：${w.description || '—'}`);
        if (w.suggestion) lines.push(`- **建议**：${w.suggestion}`);
        lines.push('');
      }
    } else {
      lines.push('（暂无数据）');
      lines.push('');
    }

    // 改进建议
    lines.push('## 改进建议');
    lines.push('');
    const suggestions = a.suggestions || [];
    if (suggestions.length > 0) {
      const priorityLabel: Record<string, string> = {
        high: '🔴 高',
        medium: '🟠 中',
        low: '🟢 低',
      };
      for (const sug of suggestions) {
        lines.push(
          `- **[${priorityLabel[sug.priority] || sug.priority || '—'}] ${sug.category || '—'}**（${sug.timeline || '—'}）`,
        );
        lines.push(`  ${sug.action || '—'}`);
      }
    } else {
      lines.push('（暂无数据）');
    }
    lines.push('');

    // 市场分析
    lines.push('## 市场分析');
    lines.push('');
    const market = a.market_analysis || {};
    if (Object.keys(market).length > 0) {
      if (market.position_demand)
        lines.push(`- **岗位需求热度**：${market.position_demand}`);
      if (market.competition_intensity)
        lines.push(`- **竞争强度**：${market.competition_intensity}`);
      if (market.candidate_positioning)
        lines.push(`- **候选人定位**：${market.candidate_positioning}`);
      if (market.salary_competitiveness_note)
        lines.push(`- **薪资竞争力**：${market.salary_competitiveness_note}`);
    } else {
      lines.push('（暂无数据）');
    }
    lines.push('');

    // 技术评估
    lines.push('## 技术评估');
    lines.push('');
    const tech = a.technology_assessment || {};
    if (Object.keys(tech).length > 0) {
      if (tech.tech_stack_score != null)
        lines.push(`- **技术栈评分**：${tech.tech_stack_score}`);
      if (tech.tech_stack_summary)
        lines.push(`- **总体评价**：${tech.tech_stack_summary}`);
      lines.push(`- **匹配技能**：${listOrNone(tech.matching_skills)}`);
      lines.push(
        `- **缺失关键技能**：${listOrNone(tech.missing_critical_skills)}`,
      );
      lines.push(
        `- **热门技能优势**：${listOrNone(tech.trending_skills_advantage)}`,
      );
      lines.push(
        `- **过时/风险技能**：${listOrNone(tech.outdated_or_risk_skills)}`,
      );
    } else {
      lines.push('（暂无数据）');
    }
    lines.push('');

    // 职业发展分析
    lines.push('## 职业发展分析');
    lines.push('');
    const career = a.career_analysis || {};
    if (Object.keys(career).length > 0) {
      if (career.career_stage)
        lines.push(`- **职业阶段**：${career.career_stage}`);
      if (career.trajectory_assessment)
        lines.push(`- **发展轨迹**：${career.trajectory_assessment}`);
      if (career.growth_rate)
        lines.push(`- **成长速度**：${career.growth_rate}`);
      if (career.estimated_work_years)
        lines.push(`- **预估工作年限**：${career.estimated_work_years}`);
      const flags = career.red_flags || [];
      lines.push(`- **预警信号**：${listOrNone(flags)}`);
    } else {
      lines.push('（暂无数据）');
    }
    lines.push('');

    // 核心发现
    lines.push('## 核心发现');
    lines.push('');
    const findings = a.key_findings || [];
    if (findings.length > 0) {
      const severityLabel: Record<string, string> = {
        critical: '🔴 严重',
        major: '🟠 主要',
        minor: '🟡 次要',
        positive: '🟢 正面',
      };
      for (const f of findings) {
        lines.push(
          `- **[${severityLabel[f.severity] || f.severity || '—'}] ${f.finding || '—'}**`,
        );
        if (f.detail) lines.push(`  ${f.detail}`);
      }
    } else {
      lines.push('（暂无数据）');
    }
    lines.push('');

    // 总结
    lines.push('## 总结');
    lines.push('');
    lines.push(a.summary || '（暂无总结）');
    lines.push('');

    // 页脚
    lines.push('---');
    lines.push(
      `*本报告由 AI 自动生成，分析日期：${meta.analysis_date || '—'}，仅供参考*`,
    );

    return lines.join('\n');
  }

  /**
   * 获取AI使用记录列表（分页）
   */
  async getUsageRecords(
    userId: string,
    page = 1,
    pageSize = 10,
    aiFunction?: string,
  ) {
    const filter: any = { userId };
    if (aiFunction) filter.aiFunction = aiFunction;
    const skip = (page - 1) * pageSize;
    const [total, list] = await Promise.all([
      this.aiUsageRecordModel.countDocuments(filter),
      this.aiUsageRecordModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
    ]);
    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 获取AI使用统计
   */
  async getUsageStats(userId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [overall, byFunction, last30Days] = await Promise.all([
      this.aiUsageRecordModel
        .aggregate([
          { $match: { userId: new Types.ObjectId(userId) } },
          {
            $group: {
              _id: null,
              totalCalls: { $sum: 1 },
              successCalls: {
                $sum: { $cond: ['$success', 1, 0] },
              },
              avgDuration: { $avg: '$duration' },
            },
          },
        ])
        .exec(),
      this.aiUsageRecordModel
        .aggregate([
          { $match: { userId: new Types.ObjectId(userId) } },
          {
            $group: {
              _id: '$aiFunction',
              total: { $sum: 1 },
              success: {
                $sum: { $cond: ['$success', 1, 0] },
              },
              avgDuration: { $avg: '$duration' },
            },
          },
        ])
        .exec(),
      this.aiUsageRecordModel
        .aggregate([
          {
            $match: {
              userId: new Types.ObjectId(userId),
              createdAt: { $gte: thirtyDaysAgo },
            },
          },
          {
            $group: {
              _id: '$aiFunction',
              total: { $sum: 1 },
              success: {
                $sum: { $cond: ['$success', 1, 0] },
              },
              avgDuration: { $avg: '$duration' },
            },
          },
        ])
        .exec(),
    ]);

    const overallStats = overall[0] || {
      totalCalls: 0,
      successCalls: 0,
      avgDuration: 0,
    };

    const byFunctionMap: Record<string, any> = {};
    for (const item of byFunction) {
      byFunctionMap[item._id] = {
        total: item.total,
        success: item.success,
        avgDuration: Math.round(item.avgDuration || 0),
      };
    }

    const last30DaysMap: Record<string, any> = {};
    for (const item of last30Days) {
      last30DaysMap[item._id] = {
        total: item.total,
        success: item.success,
        avgDuration: Math.round(item.avgDuration || 0),
      };
    }

    return {
      totalCalls: overallStats.totalCalls,
      successRate:
        overallStats.totalCalls > 0
          ? Math.round(
              (overallStats.successCalls / overallStats.totalCalls) * 100,
            ) / 100
          : 0,
      avgDuration: Math.round(overallStats.avgDuration || 0),
      byFunction: byFunctionMap,
      last30Days: last30DaysMap,
    };
  }
}
