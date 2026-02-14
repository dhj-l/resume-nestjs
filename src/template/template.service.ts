import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
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
  constructor(
    @InjectModel(Template.name) private templateModel: Model<Template>,
    @InjectModel(Resume.name) private resumeModel: Model<ResumeDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly resumeService: ResumeService,
  ) {}

  async create(createTemplateDto: CreateTemplateDto, userId: string) {
    // 检查简历是否存在且属于当前用户
    // resumeService.findOne 会抛出 Error 如果未找到
    const resume = await this.resumeService.findOne(
      createTemplateDto.resumeId,
      userId,
    );
    if (resume.isTemplate) {
      throw new BadRequestException('该简历已被设为模板，不能创建模板');
    }
    await this.resumeModel.findByIdAndUpdate(createTemplateDto.resumeId, {
      isTemplate: true,
    });

    return await this.templateModel.create({
      ...createTemplateDto,
      resume: new Types.ObjectId(createTemplateDto.resumeId),
      userId,
    });
  }

  async findAll(query: TemplateQueryDto) {
    const { page = 1, pageSize = 10, name } = query;
    const skip = (page - 1) * pageSize;

    const filter: any = {};
    if (name) {
      filter.name = { $regex: name, $options: 'i' };
    }

    const [list, total] = await Promise.all([
      this.templateModel
        .find(filter)
        .skip(skip)
        .limit(pageSize)
        .sort({ createdAt: -1 }) // 默认按创建时间倒序
        .exec(),
      this.templateModel.countDocuments(filter).exec(),
    ]);

    return {
      list,
      total,
      page: +page,
      pageSize: +pageSize,
    };
  }

  async findOne(id: string) {
    const template = await this.templateModel
      .findById(id)
      .populate('resume', 'title userId')
      .exec();
    if (!template) {
      throw new NotFoundException('模板不存在');
    }
    console.log(template);

    console.log(template.userId);

    const user = await this.userModel
      .findById(template.userId)
      .select('username email')
      .exec();
    console.log(user);

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return {
      ...template.toObject(),
      user,
    };
  }

  async update(
    id: string,
    updateTemplateDto: UpdateTemplateDto,
    userId: string,
  ) {
    const template = await this.templateModel.findById(id);
    if (!template) {
      throw new NotFoundException('模板不存在');
    }
    if (template.userId !== userId) {
      throw new ForbiddenException('没有权限修改该模板');
    }
    return this.templateModel
      .findByIdAndUpdate(id, updateTemplateDto, { new: true })
      .exec();
  }

  async remove(id: string, userId: string) {
    const template = await this.templateModel.findById(id);
    if (!template) {
      throw new NotFoundException('模板不存在');
    }
    if (template.userId !== userId) {
      throw new ForbiddenException('没有权限删除该模板');
    }

    // 恢复简历状态
    await this.resumeModel.findByIdAndUpdate(template.resumeId, {
      isTemplate: false,
    });

    return this.templateModel.findByIdAndDelete(id).exec();
  }
}
