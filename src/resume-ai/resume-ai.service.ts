import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateAiResuemDto } from './dto/createAiResuem.dto';
import {
  ResumeAi,
  ResumeAiStatusEnum,
  ResumeAiTypeEnum,
} from './entities/resume-ai.entity';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PromptTemplate } from '@langchain/core/prompts';
import { resumeAiPrompt } from './prompt/resume_ai';
import { AiService } from 'src/ai/ai.service';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { Resume } from 'src/resume/entities/resume.entity';
import { CreateResumeDto } from 'src/resume/dto/create-resume.dto';
import { DocumentParserService } from './document-parser.service';

@Injectable()
export class ResumeAiService {
  constructor(
    @InjectModel(ResumeAi.name) private resumeAiModel: Model<ResumeAi>,
    @InjectModel(Resume.name) private resumeModel: Model<Resume>,
    private readonly aiService: AiService,
    private readonly documentParserService: DocumentParserService,
  ) {}
  /**
   * 入口函数
   */
  async generateResume(createAiResuemDto: CreateAiResuemDto, userId: string) {
    const { parseType } = createAiResuemDto;
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
    //创建记录
    const record = await this.createRecord(userId, {
      ...createAiResuemDto,
      resumeContent,
    });
    try {
      const res = await this.createResumeByAi(jobDescription, resumeContent!);
      //修改状态
      await this.updateRecordStatus(
        record._id.toString(),
        ResumeAiStatusEnum.Completed,
      );
      //TODO:后续创建专门的函数处理
      // record.generatedResumeDescription = res.generatedResumeDescription;
      // await record.save();
      //根据res创建简历
      const resume = await this.createResume(
        res as CreateResumeDto,
        record.templateType,
        userId,
      );
      return resume;
    } catch (error) {
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

    //创建记录
    const record = await this.createRecord(userId, {
      ...createAiResuemDto,
      resumeContent: content,
    });
    try {
      const res = await this.createResumeByAi(jobDescription, content);
      //修改状态
      await this.updateRecordStatus(
        record._id.toString(),
        ResumeAiStatusEnum.Completed,
      );
      //TODO:后续创建专门的函数处理
      // record.generatedResumeDescription = res.generatedResumeDescription;
      // await record.save();
      // 保存记录
      await record.save();
      //根据res创建简历
      const resume = await this.createResume(
        res as CreateResumeDto,
        record.templateType,
        userId,
      );
      return resume;
    } catch (error) {
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
      const res = await this.createResumeByAi(jobDescription!, content);
      // 更新记录状态为已完成
      await this.updateRecordStatus(id, ResumeAiStatusEnum.Completed);
      //TODO:后续创建专门的函数处理
      // record.generatedResumeDescription = res.generatedResumeDescription;
      // // 保存记录
      // await record.save();
      //根据res创建简历
      const resume = await this.createResume(
        res as CreateResumeDto,
        record.templateType,
        userId,
      );
      return resume;
    } catch (error) {
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
      const parser = new JsonOutputParser();
      const chain = propmt.pipe(model).pipe(parser);
      const date = new Date();
      const current = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      const res = await chain.invoke({
        jd,
        experience: content,
        current_date: current,
      });

      return res;
    } catch (error) {
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
}
