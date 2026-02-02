import { Injectable } from '@nestjs/common';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { DownloadResumeDto } from './dto/download-resume.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Resume, ResumeDocument } from './entities/resume.entity';
import { Model, Types } from 'mongoose';
import puppeteer from 'puppeteer';

@Injectable()
export class ResumeService {
  constructor(
    @InjectModel(Resume.name) private resumeModel: Model<ResumeDocument>,
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

  async create(userId: string) {
    return await this.resumeModel.create({
      userId,
      user: new Types.ObjectId(userId),
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
      throw new Error('简历不存在');
    }
    return resume;
  }

  async update(id: string, updateResumeDto: UpdateResumeDto, userId: string) {
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
}
