import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { DownloadResumeDto } from './dto/download-resume.dto';
import { CreateResumeDto } from './dto/create-resume.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Resume, ResumeDocument } from './entities/resume.entity';
import {
  Template,
  TemplateDocument,
} from '../template/entities/template.entity';
import { Model, Types } from 'mongoose';
import puppeteer from 'puppeteer';

@Injectable()
export class ResumeService {
  constructor(
    @InjectModel(Resume.name) private resumeModel: Model<ResumeDocument>,
    @InjectModel(Template.name) private templateModel: Model<TemplateDocument>,
  ) {}

  private getContent(html: string, css: string, url: string) {
    return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <script src="${url}"></script>
            <style>
              html, body {
                margin: 0;
                padding: 0;
                background-color: white;
              }
              ${css}
            </style>
          </head>
          <body>
            ${html}
          </body>
        </html>
      `;
  }

  /**
   * 下载简历 PDF
   * @param downloadResumeDto 包含 html 和 css
   * @returns PDF buffer
   */
  async downloadResume(downloadResumeDto: DownloadResumeDto): Promise<Buffer> {
    const { html, css } = downloadResumeDto;
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();

      // 组合 HTML 和 CSS
      // 为了确保样式正确应用，我们将 CSS 放入 head 标签中
      // 注入 Tailwind CSS CDN 以支持 Tailwind 类名
      const content = this.getContent(
        html,
        css,
        'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4',
      );

      await page.setContent(content, {
        waitUntil: 'networkidle0', // 等待网络空闲，确保资源加载完成（包括 Tailwind CDN 脚本执行）
      });

      // 生成 PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true, // 打印背景颜色/图片
        margin: {
          top: '10mm',
          right: '10mm',
          bottom: '10mm',
          left: '10mm',
        },
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  /**
   * 创建简历
   * @param userId 当前操作用户的 ID
   * @param createResumeDto 创建简历的 DTO，包含可选的模板 ID 和标题
   * @returns 返回新创建的简历对象
   */
  async create(userId: string, createResumeDto: CreateResumeDto) {
    const { templateId, title } = createResumeDto;

    // 如果传入了模板 ID，则进入模板创建逻辑
    if (templateId) {
      // 1. 查询模板信息
      const template = await this.templateModel.findById(templateId).exec();
      if (!template) {
        throw new NotFoundException('指定的模板不存在');
      }

      // 2. 获取该模板关联的简历原始数据，并排除不需要的字段
      const resumeData = await this.resumeModel
        .findById(template.resumeId)
        .select('-_id -createdAt -updatedAt -__v')
        .lean()
        .exec();

      if (!resumeData) {
        throw new NotFoundException('模板关联的简历原始数据已丢失');
      }
      console.log(resumeData);

      // 3. 创建新简历，并将所有权归属于当前用户，同时标记为非模板
      return await this.resumeModel.create({
        ...resumeData,
        title: title || `${resumeData.title} (副本)`,
        userId,
        user: new Types.ObjectId(userId),
        isTemplate: false, // 新生成的简历不应被标记为模板
      });
    }

    // 如果没有传入模板 ID，则创建一个默认的空白简历
    return await this.resumeModel.create({
      title: title || '未命名简历',
      userId,
      user: new Types.ObjectId(userId),
      isTemplate: false,
    });
  }
  // 查找所有模板
  async findAllTemplates() {
    return await this.resumeModel.find({ isTemplate: true }).exec();
  }
  /**
   * 查找用户所有非模板简历
   */
  async findAll(userId: string) {
    return await this.resumeModel.find({ userId, isTemplate: false }).exec();
  }

  async findOne(id: string, userId: string) {
    const resume = await this.resumeModel.findOne({
      _id: id,
      userId,
    });
    if (!resume) {
      throw new BadRequestException('简历不存在');
    }
    return resume;
  }

  async update(id: string, updateResumeDto: UpdateResumeDto, userId: string) {
    console.log(id);
    console.log(userId);

    const resume = await this.resumeModel.findOne({
      _id: id,
      userId,
    });
    if (!resume) {
      throw new Error('简历不存在');
    }

    return await this.resumeModel.findByIdAndUpdate(
      id,
      {
        ...updateResumeDto,
        updatedAt: new Date(),
      },
      {
        new: true,
      },
    );
  }

  async remove(id: string, userId: string) {
    const resume = await this.resumeModel.findOneAndDelete({
      _id: id,
      userId,
    });
    if (!resume) {
      throw new Error('简历不存在');
    }
    return resume;
  }

  /**
   * 复制简历
   * 根据简历 ID 复制当前用户的简历，生成一份新的非模板简历
   * @param id 待复制的简历 ID
   * @param userId 当前操作用户 ID，用于权限校验与归属
   * @param title 可选的新标题，未提供则使用“原标题 (副本)”
   */
  async copy(id: string, userId: string, title?: string) {
    // 校验目标简历是否存在且属于当前用户
    const doc = await this.resumeModel
      .findOne({ _id: id, userId })
      .select('-_id -createdAt -updatedAt -__v -user -userId -isTemplate')
      .exec();
    if (!doc) {
      throw new BadRequestException('简历不存在');
    }

    // 将文档转换为普通对象（已通过 select 排除不需要的字段）
    const sourceObj = doc.toObject() as Partial<Resume> & { title?: string };

    const newTitle = title || `${doc.title ?? '未命名简历'} (副本)`;

    return await this.resumeModel.create({
      ...(sourceObj as Record<string, unknown>),
      title: newTitle,
      isTemplate: false,
      userId,
      user: new Types.ObjectId(userId),
    });
  }
}
