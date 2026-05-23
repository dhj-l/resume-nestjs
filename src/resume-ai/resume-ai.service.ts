import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateAiResuemDto, ParserResumeDto } from './dto/createAiResuem.dto';
import {
  ResumeAi,
  ResumeAiStatusEnum,
  ResumeAiTypeEnum,
} from './entities/resume-ai.entity';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PromptTemplate } from '@langchain/core/prompts';
import { ContentPromt, resumeAiPrompt } from './prompt/resume_ai';
import { AiService } from 'src/ai/ai.service';
import { JsonOutputParser } from '@langchain/core/output_parsers';
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
import { MODULE_PROMPTS, MODULE_EXECUTION_ORDER } from './prompt/modules';
import { GetResumeRecordsDto } from './dto/get-resume-record.dto';
import { ResumeEditRecord } from './entities/resume-edit-record.entity';
import { PolishResumeDto } from './dto/polish-resume.dto';
import { UndoEditDto } from './dto/undo-edit.dto';
import { polishContentPrompt } from './prompt/polish-content.prompt';
import { AnalyzeResumeDto } from './dto/analyze-resume.dto';
import {
  ResumeAnalysisRecord,
  AnalysisStatusEnum,
} from './entities/resume-analysis-record.entity';
import { analyzeResumePrompt } from './prompt/analyze-resume.prompt';

@Injectable()
export class ResumeAiService {
  constructor(
    @InjectModel(ResumeAi.name) private resumeAiModel: Model<ResumeAi>,
    @InjectModel(Resume.name) private resumeModel: Model<Resume>,
    @InjectModel(ResumeEditRecord.name)
    private editRecordModel: Model<ResumeEditRecord>,
    @InjectModel(ResumeAnalysisRecord.name)
    private analysisRecordModel: Model<ResumeAnalysisRecord>,
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
    try {
      const res = await this.createResumeByAi(jobDescription, resumeContent!);
      //根据res创建简历
      const resume = await this.createResume(
        res as CreateResumeDto,
        record.templateType,
        userId,
      );
      // 保存生成的简历ID
      record.generatedResumeId = resume._id.toString();
      await record.save();
      // 修改状态（简历已创建成功后再标记完成）
      await this.updateRecordStatus(
        record._id.toString(),
        ResumeAiStatusEnum.Completed,
      );
      return resume;
    } catch {
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
    try {
      const res = await this.createResumeByAi(jobDescription, content);
      //根据res创建简历
      const resume = await this.createResume(
        res as CreateResumeDto,
        record.templateType,
        userId,
      );
      // 保存生成的简历ID
      record.generatedResumeId = resume._id.toString();
      await record.save();
      // 修改状态（简历已创建成功后再标记完成）
      await this.updateRecordStatus(
        record._id.toString(),
        ResumeAiStatusEnum.Completed,
      );
      return resume;
    } catch {
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
    try {
      //调用 AI 模型创建简历
      const res = await this.createResumeByAi(jobDescription, content);
      //根据res创建简历
      const resume = await this.createResume(
        res as CreateResumeDto,
        record.templateType,
        userId,
      );
      // 保存生成的简历ID
      record.generatedResumeId = resume._id.toString();
      await record.save();
      // 更新记录状态（简历已创建成功后再标记完成）
      await this.updateRecordStatus(id, ResumeAiStatusEnum.Completed);
      return resume;
    } catch {
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
    const newRecord = this.resumeAiModel.create({
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
   * ai创建简历
   * @param jd 岗位 JD
   * @param content 详细信息
   */
  async createResumeByAi(jd: string, content: string) {
    try {
      const propmt = PromptTemplate.fromTemplate(resumeAiPrompt);
      const model = this.aiService.generateResume();
      // const model = this.aiService.generateResumeDeepSeek();
      const parser = new JsonOutputParser();
      const chain = propmt.pipe(model).pipe(parser);
      const date = new Date();
      const current = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const res = await chain.invoke({
        jd,
        experience: content,
        current_date: current,
      });

      return res;
    } catch (error) {
      console.log(error);
      throw new BadRequestException('ai创建简历失败');
    }
  }

  /**
   * 创建简历
   * @param resume 简历信息
   * @param type 简历模板类型
   * @param userId 用户 ID
   */
  async createResume(resume: CreateResumeDto, type: string, userId: string) {
    const res = await this.resumeModel.create({
      ...resume,
      type,
      userId,
      user: new Types.ObjectId(userId),
    });
    return res;
  }

  /**
   * 解析简历
   */
  async parseResume(parserResumeDto: ParserResumeDto, userId: string) {
    try {
      //检查当前用户是否存在正在创建的简历
      await this.checkExistResume(userId);
      const { resumeContent, templateType, templateId } = parserResumeDto;
      //校验简历内容是否合格
      const { isValid, reason } = this.validateResumeContent(resumeContent);
      if (!isValid) {
        throw new BadRequestException(reason);
      }
      const prompt = PromptTemplate.fromTemplate(ContentPromt);
      const model = this.aiService.generateImportResume();
      const parser = new JsonOutputParser();
      const chain = prompt.pipe(model).pipe(parser);
      const date = new Date();
      const current = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const res = await chain.invoke({
        resume_text: resumeContent,
        current_date: current,
      });
      const result = await this.createResume(
        { ...res, templateId } as CreateResumeDto,
        templateType,
        userId,
      );
      return result;
    } catch (error) {
      throw new BadRequestException(error.message);
    }
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
          .sort({ createdAt: -1 }),
      ]);
      return { total, list };
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
      contentLength: resumeContent.length,
      paragraphCount: 0,
      lineBreakCount: 0,
      dateCount: 0,
    };

    const length = resumeContent.length;

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

    const paragraphs = resumeContent
      .split(/\n\s*\n/)
      .filter((p) => p.trim().length > 0);
    const lineBreaks = (resumeContent.match(/\n/g) || []).length;

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

    const dateCount = countDatePatterns(resumeContent);
    details.dateCount = dateCount;

    if (dateCount >= RESUME_MIN_DATE_COUNT) {
      details.hasTimeFormat = true;
      score += 10;
    } else {
      errors.push(messages.missingTimeFormat);
    }

    details.hasContactInfo = hasContactInfo(resumeContent);

    let matchedGroups = 0;

    for (const group of RESUME_KEYWORD_GROUPS) {
      if (matchResumeKeywordGroup(resumeContent, group)) {
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

    if (hasNonResumeContent(resumeContent)) {
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
      !hasNonResumeContent(resumeContent) &&
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
    ).catch((error: any) => {
      // 发送错误消息
      const errorMessage: SseMessage = {
        type: 'error',
        moduleName: 'system',
        status: 'failed',
        message: error?.message || '简历生成失败',
        totalModules: MODULE_EXECUTION_ORDER.length,
        currentModule: 0,
      };
      sseSubject.next(errorMessage);
      sseSubject.error(error);
      stopSignal.next();
      stopSignal.complete();
    });

    return sseSubject.asObservable().pipe(
      takeUntil(stopSignal),
      catchError((error) => {
        console.error('SSE连接错误:', error);
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
  ): Promise<void> {
    const { parseType, jobDescription } = createAiResuemDto;

    // 获取简历内容
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
        resumeContent = this.parseSupplementary(resume.toObject());
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

    try {
      // 执行所有模块
      const moduleResults = await this.executeAllModules(
        jobDescription,
        resumeContent,
        sseSubject,
        retryConfig,
      );

      // 聚合结果
      const aggregatedResult = this.aggregateModuleResults(moduleResults);

      // 创建简历
      const resume = await this.createResume(
        aggregatedResult as CreateResumeDto,
        record.templateType,
        userId,
      );

      // 保存生成的简历ID
      record.generatedResumeId = resume._id.toString();
      await record.save();

      // 更新记录状态
      await this.updateRecordStatus(
        record._id.toString(),
        ResumeAiStatusEnum.Completed,
      );

      // 发送完成消息
      this.sendProgress(
        sseSubject,
        'complete',
        'completed',
        MODULE_EXECUTION_ORDER.length,
        MODULE_EXECUTION_ORDER.length,
        '简历生成完成',
        0,
        resume._id.toString(),
      );

      // 关闭连接
      stopSignal.next();
      stopSignal.complete();
      sseSubject.complete();
    } catch (error) {
      // 更新记录状态为失败
      await this.updateRecordStatus(
        record._id.toString(),
        ResumeAiStatusEnum.Failed,
      );
      throw error;
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
  ): Promise<ModuleResult[]> {
    const results: ModuleResult[] = [];
    const currentDate = new Date();
    const current = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

    for (let i = 0; i < MODULE_EXECUTION_ORDER.length; i++) {
      const [moduleName, moduleLabel] = MODULE_EXECUTION_ORDER[i];
      const moduleConfig = MODULE_PROMPTS[moduleName];

      // 发送开始处理消息
      this.sendProgress(
        sseSubject,
        moduleName,
        'processing',
        i + 1,
        MODULE_EXECUTION_ORDER.length,
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
        this.sendProgress(
          sseSubject,
          moduleName,
          'completed',
          i + 1,
          MODULE_EXECUTION_ORDER.length,
          `${moduleName}模块处理完成`,
        );
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

        if (attempt < retryConfig.maxRetries) {
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
      console.error(`AI调用失败: ${error}`);
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
   * 聚合所有模块结果
   */
  private aggregateModuleResults(moduleResults: ModuleResult[]): any {
    const aggregated: any = {};

    for (const result of moduleResults) {
      if (result.success && result.data) {
        // 将模块数据添加到聚合对象中
        Object.assign(aggregated, result.data);
      }
    }

    return aggregated;
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
    recordId?: string,
  ): void {
    const sseMessage: SseMessage = {
      type: 'progress',
      moduleName,
      status,
      message,
      retryCount,
      totalModules,
      currentModule,
      recordId,
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

    // 1. 校验key
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

    // 2. 查询简历并验证归属
    const selectFields = isArrayModule ? key : `${key}.content`;
    const resume = await this.resumeModel
      .findOne({ _id: resumeId, userId })
      .select(selectFields)
      .lean();
    if (!resume) {
      throw new BadRequestException('简历不存在');
    }

    // 3. 提取当前内容
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

    // 4. 调用AI润色
    const current = new Date();
    const currentDate = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;

    const promptTemplate = PromptTemplate.fromTemplate(polishContentPrompt);
    const model = this.aiService.generateResume();
    const parser = new JsonOutputParser();
    const chain = promptTemplate.pipe(model).pipe(parser);

    let aiResult: Record<string, string>;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('AI润色超时')), 60000);
      });
      aiResult = await Promise.race([
        chain.invoke({
          current_content: JSON.stringify(
            isArrayModule ? (resume[key] as any[])[index] : resume[key],
            null,
            2,
          ),
          module_key: key,
          description: description || '请对内容进行通用润色优化',
          current_date: currentDate,
        }),
        timeoutPromise,
      ]);
      console.log(aiResult);
    } catch (error: any) {
      throw new BadRequestException('AI润色失败: ' + error.message);
    }

    if (!aiResult || Object.keys(aiResult).length === 0) {
      throw new BadRequestException('AI润色结果为空，请重试');
    }

    // 5. 将AI结果写回简历
    const afterContent = beforeContent; // 先保留，下面合并后更新
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

    // 6. 获取修改后的实际内容用于记录
    let finalAfterContent: string;
    if (isArrayModule) {
      const textFields = ResumeAiService.POLISHABLE_FIELDS[key];
      finalAfterContent = aiResult[textFields[0]] || '';
    } else {
      const textFields = ResumeAiService.POLISHABLE_FIELDS[key];
      finalAfterContent = aiResult[textFields[0]] || aiResult.content || '';
    }

    // 7. 创建修改记录
    const record = await this.editRecordModel.create({
      resumeId,
      editKey: key,
      editIndex: isArrayModule ? index : null,
      beforeContent,
      afterContent: finalAfterContent,
      userId,
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

    // 1. 查找并验证编辑记录
    const record = await this.editRecordModel.findOne({
      _id: recordId,
      resumeId,
      userId,
    });
    if (!record) {
      throw new BadRequestException('编辑记录不存在或无权操作');
    }

    // 2. 验证简历存在
    const resume = await this.resumeModel
      .findOne({ _id: resumeId, userId })
      .lean();
    if (!resume) {
      throw new BadRequestException('简历不存在');
    }

    // 3. 恢复原始内容
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

    // 4. 删除编辑记录
    await this.editRecordModel.findByIdAndDelete(recordId);

    return { success: true, restoredContent: beforeContent };
  }

  /**
   * AI分析简历与岗位JD的匹配度
   */
  async analyzeResume(analyzeResumeDto: AnalyzeResumeDto, userId: string) {
    const { resumeId, jobDescription } = analyzeResumeDto;

    // 1. 查询简历并验证归属
    const resume = await this.resumeModel
      .findOne({ _id: resumeId, userId })
      .lean();
    if (!resume) {
      throw new BadRequestException('简历不存在');
    }

    // 2. 创建分析记录
    const record = await this.analysisRecordModel.create({
      resumeId,
      jobDescription,
      status: AnalysisStatusEnum.Analyzing,
      userId,
    });

    try {
      // 3. 提取简历内容（将简历各模块序列化为文本）
      const resumeContent = JSON.stringify(
        {
          basicInfo: resume.basicInfo,
          jobIntention: resume.jobIntention,
          educationBackground: resume.educationBackground,
          workExperience: resume.workExperience,
          projectExperience: resume.projectExperience,
          skills: resume.skills,
          certificates: resume.certificates,
          selfEvaluation: resume.selfEvaluation,
          campusExperience: resume.campusExperience,
          internshipExperience: resume.internshipExperience,
        },
        null,
        2,
      );

      // 4. 调用AI分析
      const current = new Date();
      const currentDate = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;

      const promptTemplate = PromptTemplate.fromTemplate(analyzeResumePrompt);
      const model = this.aiService.generateResume();
      const parser = new JsonOutputParser();
      const chain = promptTemplate.pipe(model).pipe(parser);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('AI分析超时')), 120000);
      });

      const aiResult = await Promise.race([
        chain.invoke({
          jd: jobDescription,
          experience: resumeContent,
          current_date: currentDate,
        }),
        timeoutPromise,
      ]);

      if (!aiResult || Object.keys(aiResult).length === 0) {
        throw new BadRequestException('AI分析结果为空，请重试');
      }

      // 5. 更新分析记录
      await this.analysisRecordModel.findByIdAndUpdate(record._id, {
        status: AnalysisStatusEnum.Completed,
        analysisResult: aiResult,
      });

      return {
        recordId: record._id,
        analysisResult: aiResult,
      };
    } catch (error: any) {
      // 更新状态为失败（尽力而为，不掩盖原始错误）
      try {
        await this.analysisRecordModel.findByIdAndUpdate(record._id, {
          status: AnalysisStatusEnum.Failed,
        });
      } catch (_) {
        // 状态更新失败不影响错误抛出
      }
      throw new BadRequestException('AI分析失败: ' + error.message);
    }
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
    if (!data) {
      throw new BadRequestException('未找到该简历的AI分析记录');
    }
    return data;
  }
}
