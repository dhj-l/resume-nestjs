import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { Template } from './entities/template.entity';
import { ResumeService } from '../resume/resume.service';
import { Resume } from 'src/resume/entities/resume.entity';
import { ResumeDocument } from 'src/resume/entities/resume.entity';
import { TemplateQueryDto } from './dto/template-query.dto';
import { User, UserDocument } from 'src/user/entities/user.entity';

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  constructor(
    @InjectModel(Template.name) private templateModel: Model<Template>,
    @InjectModel(Resume.name) private resumeModel: Model<ResumeDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly resumeService: ResumeService,
  ) {}

  /**
   * 创建模板
   * @param createTemplateDto 创建模板DTO
   * @param userId 用户ID
   * @returns 创建的模板
   */
  async create(createTemplateDto: CreateTemplateDto, userId: string) {
    try {
      this.logger.log(`用户 ${userId} 尝试创建模板: ${createTemplateDto.name}`);

      // 检查简历是否存在且属于当前用户
      const resume = await this.resumeService.findOne(
        createTemplateDto.resumeId,
        userId,
      );

      // 检查简历是否已被设为模板
      if (resume.isTemplate) {
        throw new BadRequestException('该简历已被设为模板，不能创建模板');
      }

      // 更新简历状态为模板
      await this.resumeModel.findByIdAndUpdate(
        createTemplateDto.resumeId,
        { isTemplate: true },
      );

      // 创建模板记录
      const template = await this.templateModel
        .create({
          ...createTemplateDto,
          resume: new Types.ObjectId(createTemplateDto.resumeId),
          userId,
        });

      this.logger.log(`模板创建成功: ${template._id.toString()}`);
      return template;
    } catch (error) {
      this.logger.error(
        `创建模板失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * 查询模板列表
   * @param query 查询参数
   * @returns 模板列表
   */
  async findAll(query: TemplateQueryDto) {
    try {
      const { page = 1, pageSize = 10, name } = query;
      const skip = (page - 1) * pageSize;

      const filter: Record<string, any> = {};
      if (name) {
        filter.name = { $regex: name, $options: 'i' };
      }

      const [list, total] = await Promise.all([
        this.templateModel
          .find(filter)
          .skip(skip)
          .limit(pageSize)
          .sort({ createdAt: -1 })
          .exec(),
        this.templateModel.countDocuments(filter).exec(),
      ]);

      return {
        list,
        total,
        page: +page,
        pageSize: +pageSize,
      };
    } catch (error) {
      this.logger.error(
        `查询模板列表失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * 查询单个模板
   * @param id 模板ID
   * @returns 模板详情
   */
  async findOne(id: string) {
    try {
      this.logger.log(`查询模板: ${id}`);

      const template = await this.templateModel
        .findById(id)
        .populate('resume', 'title userId type')
        .exec();

      if (!template) {
        throw new NotFoundException('模板不存在');
      }

      const user = await this.userModel
        .findById(template.userId)
        .select('username email')
        .exec();

      if (!user) {
        throw new NotFoundException('用户不存在');
      }

      return {
        ...template.toObject(),
        user,
      };
    } catch (error) {
      this.logger.error(
        `查询模板失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * 更新模板
   * 使用 findOneAndUpdate 确保原子性操作，防止并发竞态条件
   * @param id 模板ID
   * @param updateTemplateDto 更新模板DTO
   * @param userId 用户ID
   * @returns 更新后的模板
   */
  async update(
    id: string,
    updateTemplateDto: UpdateTemplateDto,
    userId: string,
  ) {
    try {
      this.logger.log(`用户 ${userId} 尝试更新模板: ${id}`);

      // 使用 findOneAndUpdate 确保原子性操作，同时验证权限
      const template = await this.templateModel.findOneAndUpdate(
        { _id: id, userId }, // 同时匹配 ID 和 userId，确保权限
        updateTemplateDto,
        { new: true },
      );

      if (!template) {
        throw new NotFoundException('模板不存在或无权修改');
      }

      this.logger.log(`模板更新成功: ${id}`);
      return template;
    } catch (error) {
      this.logger.error(
        `更新模板失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * 删除模板
   * @param id 模板ID
   * @param userId 用户ID
   * @returns 删除的模板
   */
  async remove(id: string, userId: string) {
    try {
      this.logger.log(`用户 ${userId} 尝试删除模板: ${id}`);

      // 查询模板并验证权限
      const template = await this.templateModel
        .findOne({ _id: id, userId });

      if (!template) {
        throw new NotFoundException('模板不存在或无权删除');
      }

      // 恢复简历状态
      await this.resumeModel.findByIdAndUpdate(
        template.resumeId,
        { isTemplate: false },
      );

      // 删除模板
      const deletedTemplate = await this.templateModel
        .findByIdAndDelete(id)
        .exec();

      this.logger.log(`模板删除成功: ${id}`);
      return deletedTemplate;
    } catch (error) {
      this.logger.error(
        `删除模板失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }
}
