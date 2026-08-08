import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
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
import { ResumeAi } from '../resume-ai/entities/resume-ai.entity';
import { ResumeEditRecord } from '../resume-ai/entities/resume-edit-record.entity';
import { ResumeAnalysisRecord } from '../resume-ai/entities/resume-analysis-record.entity';
import { Model, Types } from 'mongoose';
import puppeteer from 'puppeteer';
import { readFileSync } from 'fs';
import { join } from 'path';
import { GetResumeDto } from './dto/get-resume.dto';
import { AdminQueryResumeDto } from './dto/admin-query-resume.dto';

type SortableItem = {
  globalSort?: number;
  localSort?: number;
};

@Injectable()
export class ResumeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResumeService.name);
  private tailwindScript: string;

  /** 复用的浏览器实例（应用级单例），避免每次生成 PDF 都创建新进程 */
  private browser: any = null;
  /** 浏览器初始化互斥锁，防止并发请求创建多个浏览器实例 */
  private browserInitPromise: Promise<any> | null = null;

  constructor(
    @InjectModel(Resume.name) private resumeModel: Model<ResumeDocument>,
    @InjectModel(Template.name) private templateModel: Model<TemplateDocument>,
    @InjectModel(ResumeAi.name) private resumeAiModel: Model<ResumeAi>,
    @InjectModel(ResumeEditRecord.name)
    private editRecordModel: Model<ResumeEditRecord>,
    @InjectModel(ResumeAnalysisRecord.name)
    private analysisRecordModel: Model<ResumeAnalysisRecord>,
  ) {}

  onModuleInit() {
    try {
      // 在开发环境和生产环境中，__dirname 分别指向 src/resume 和 dist/src/resume
      // 我们需要向上一级找到 dist 目录，然后访问 assets 文件夹
      const tailwindPath = join(
        __dirname,
        '..',
        '..',
        'assets',
        'tailwind.browser.js',
      );
      this.tailwindScript = readFileSync(tailwindPath, 'utf-8');
      this.logger.log('Tailwind CSS 脚本加载成功');
    } catch (error) {
      this.logger.error('加载 Tailwind CSS 脚本失败', (error as Error).stack);
      throw new Error('初始化失败：无法加载 Tailwind CSS 脚本');
    }
  }

  /**
   * 获取或创建浏览器实例（应用级单例）
   *
   * 复用单个浏览器进程来生成所有 PDF，避免每次请求都创建/
   * 销毁 Chromium 进程。使用互斥锁防止并发请求创建多个实例。
   *
   * 浏览器断开连接时自动重置引用，下次请求会重新创建。
   */
  private async getBrowser(): Promise<any> {
    if (this.browser?.isConnected()) {
      return this.browser;
    }

    // 并发控制：已有初始化在跑就直接等结果
    if (this.browserInitPromise) {
      return this.browserInitPromise;
    }

    this.browserInitPromise = (async () => {
      try {
        this.logger.log('启动浏览器实例（首次创建或断开后重建）');
        const newBrowser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        // 浏览器异常断开时清空引用，下次调用自动重建
        newBrowser.on('disconnected', () => {
          this.logger.warn('浏览器实例断开连接，将在下次请求时重建');
          this.browser = null;
        });

        this.browser = newBrowser;
        return newBrowser;
      } finally {
        // 无论成功失败都释放锁，失败后下次调用会重试
        this.browserInitPromise = null;
      }
    })();

    return this.browserInitPromise;
  }

  /**
   * 应用关闭时清理浏览器资源
   *
   * NestJS 生命周期钩子，在 `app.close()` 或 `SIGTERM` 触发优雅关闭时调用。
   * 确保没有孤儿 Chromium 子进程残留。
   */
  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      this.logger.log('关闭浏览器实例');
      try {
        await this.browser.close();
      } catch (error) {
        this.logger.error(`关闭浏览器失败: ${(error as Error).message}`);
      }
      this.browser = null;
    }
  }

  /**
   * 处理排序字段，确保数组中每个元素都有正确的排序值
   * @param items 需要处理排序的项目数组
   * @returns 处理后的数组，每个元素都包含 globalSort 和 localSort 字段
   */
  private processSortFields<T extends SortableItem>(items: T[]): T[] {
    if (!items || !Array.isArray(items)) return items;

    return items.map((item, index) => ({
      ...item,
      globalSort: item.globalSort ?? 0,
      localSort: item.localSort ?? index,
    }));
  }

  /**
   * 为 DTO 中的数组字段添加排序字段
   * @param dto 创建或更新简历的 DTO
   * @returns 处理后的 DTO，包含排序字段
   */
  private enrichWithSortFields(dto: UpdateResumeDto | CreateResumeDto) {
    const result = { ...dto };

    if (result.educationBackground) {
      result.educationBackground = this.processSortFields(
        result.educationBackground,
      );
    }
    if (result.workExperience) {
      result.workExperience = this.processSortFields(result.workExperience);
    }
    if (result.campusExperience) {
      result.campusExperience = this.processSortFields(result.campusExperience);
    }
    if (result.projectExperience) {
      result.projectExperience = this.processSortFields(
        result.projectExperience,
      );
    }
    if (result.internshipExperience) {
      result.internshipExperience = this.processSortFields(
        result.internshipExperience,
      );
    }

    return result;
  }

  /**
   * 清洗从数据库查出的简历数据，兼容旧格式
   * 将 skills/certificates/selfEvaluation 从字符串转换为嵌入式对象
   */
  private sanitizeResumeData(data: any) {
    const result = { ...data };
    const embedFields = ['skills', 'certificates', 'selfEvaluation'] as const;

    for (const field of embedFields) {
      if (typeof result[field] === 'string') {
        result[field] = { content: result[field], globalSort: 0 };
      }
    }

    return result;
  }

  private getContent(html: string, css: string) {
    return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <script>${this.tailwindScript}</script>
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
   * 后处理 Puppeteer 页面 DOM，消除固定高度分页导致的空白
   */
  private async preparePageForPdf(page: any): Promise<void> {
    await page.addStyleTag({
      content: `
        * {
          break-inside: auto !important;
          page-break-inside: auto !important;
          -webkit-column-break-inside: auto !important;
        }
      `,
    });

    await page.evaluate(() => {
      const allElements = document.querySelectorAll('*');
      const a4HeightPx = 1123; // 297mm ≈ 1123px at 96dpi

      for (const el of allElements) {
        const style = window.getComputedStyle(el);
        if (style.height && style.height !== 'auto' && style.height !== '0px') {
          const heightPx = parseFloat(style.height);
          if (heightPx >= a4HeightPx * 0.9) {
            (el as HTMLElement).style.height = 'auto';
            (el as HTMLElement).style.minHeight = 'auto';
            (el as HTMLElement).style.overflow = 'visible';
          }
        }
      }

      document.body.style.overflow = 'visible';
      for (const child of document.body.children) {
        const htmlChild = child as HTMLElement;
        const style = window.getComputedStyle(htmlChild);
        if (style.overflow === 'hidden' || style.overflowX === 'hidden') {
          htmlChild.style.overflow = 'visible';
          htmlChild.style.overflowX = 'visible';
        }
      }
    });
  }

  /**
   * 下载简历 PDF
   * @param downloadResumeDto 包含 html 和 css
   * @returns PDF buffer
   */
  async downloadResume(downloadResumeDto: DownloadResumeDto): Promise<Buffer> {
    const { html, css } = downloadResumeDto;
    let page: any;
    try {
      this.logger.log('开始生成 PDF 简历');

      // 复用应用级浏览器单例，避免每次请求创建/销毁进程
      const browser = await this.getBrowser();
      page = await browser.newPage();

      const content = this.getContent(html, css);

      await page.setContent(content, {
        waitUntil: 'domcontentloaded',
      });

      await page.waitForFunction(() => {
        return document.readyState === 'complete';
      });

      // 后处理 DOM，消除固定高度分页导致的空白
      await this.preparePageForPdf(page);

      // 生成 PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '0mm',
          right: '0mm',
          bottom: '0mm',
          left: '0mm',
        },
      });

      this.logger.log('PDF 简历生成成功');
      return Buffer.from(pdfBuffer);
    } catch (error) {
      this.logger.error(
        `生成 PDF 失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new BadRequestException('生成 PDF 失败，请检查 HTML 和 CSS 格式');
    } finally {
      // 只关闭页面（轻量），浏览器实例留给后续请求复用
      if (page) {
        try {
          await page.close();
        } catch {
          // 页面关闭失败不影响主流程
        }
      }
    }
  }

  /**
   * 创建简历
   * 支持根据模板创建或创建空白简历
   * @param userId 当前操作用户的 ID
   * @param createResumeDto 创建简历的 DTO，包含可选的模板 ID 和标题
   * @returns 返回新创建的简历对象
   */
  async create(userId: string, createResumeDto: CreateResumeDto) {
    const { templateId, title } = createResumeDto;

    if (templateId) {
      this.logger.log(`用户 ${userId} 尝试基于模板 ${templateId} 创建简历`);

      // 查找模板
      const template = await this.templateModel.findById(templateId).exec();
      if (!template) {
        this.logger.warn(`模板 ${templateId} 不存在`);
        throw new NotFoundException('指定的模板不存在');
      }

      // 获取模板关联的原始简历数据
      const resumeData = await this.resumeModel
        .findById(template.resumeId)
        .select('-_id -createdAt -updatedAt -__v -user -userId -isTemplate')
        .lean()
        .exec();

      if (!resumeData) {
        this.logger.warn(`模板 ${templateId} 关联的简历数据已丢失`);
        throw new NotFoundException('模板关联的简历原始数据已丢失');
      }

      // 清洗旧格式数据，兼容 schema 变更前创建的模板
      const sanitizedData = this.sanitizeResumeData(resumeData);

      // 创建新简历
      const newResume = await this.resumeModel.create({
        ...sanitizedData,
        type: sanitizedData.type || 'default',
        title: title || `${sanitizedData.title} (副本)`,
        userId,
        user: new Types.ObjectId(userId),
        isTemplate: false,
      });

      this.logger.log(
        `用户 ${userId} 基于模板 ${templateId} 成功创建简历: ${newResume._id.toString()}`,
      );
      return newResume;
    }

    // 创建空白简历
    this.logger.log(`用户 ${userId} 创建空白简历`);
    const enrichedDto = this.enrichWithSortFields(createResumeDto);

    const newResume = await this.resumeModel.create({
      title: title || '未命名简历',
      userId,
      user: new Types.ObjectId(userId),
      isTemplate: false,
      ...enrichedDto,
    });

    this.logger.log(
      `用户 ${userId} 成功创建空白简历: ${newResume._id.toString()}`,
    );
    return newResume;
  }
  /**
   * 查找所有模板简历
   * 注意：此方法返回所有模板，不进行分页
   * @returns 所有模板简历列表
   */
  async findAllTemplates() {
    this.logger.log('查询所有模板简历');
    const templates = await this.resumeModel.find({ isTemplate: true }).exec();
    this.logger.log(`找到 ${templates.length} 个模板简历`);
    return templates;
  }

  /**
   * 查找用户所有非模板简历（分页）
   * @param userId 用户 ID
   * @param query 查询参数，包含分页信息
   * @returns 简历列表和分页信息
   */
  async findAll(userId: string, query: GetResumeDto) {
    // 验证分页参数
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 6));

    this.logger.log(
      `用户 ${userId} 查询简历列表，页码: ${page}, 每页: ${pageSize}`,
    );

    const [res, total] = await Promise.all([
      this.resumeModel
        .find({ userId, isTemplate: false })
        .select([
          '_id',
          'userId',
          'title',
          'cover',
          'isTemplate',
          'aiStatus',
          'createdAt',
          'updatedAt',
        ])
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .sort({ createdAt: -1 })
        .exec(),
      this.resumeModel.countDocuments({
        userId,
        isTemplate: false,
      }),
    ]);

    this.logger.log(
      `用户 ${userId} 共有 ${total} 份简历，当前页返回 ${res.length} 份`,
    );

    return {
      list: res,
      total,
      page,
      pageSize,
    };
  }

  /**
   * 查找单个简历
   * @param id 简历 ID
   * @param userId 用户 ID，用于权限验证
   * @returns 简历对象
   * @throws BadRequestException 当简历不存在或无权访问时
   */
  async findOne(id: string, userId: string) {
    this.logger.log(`用户 ${userId} 查询简历 ${id}`);

    const resume = await this.resumeModel.findOne({
      _id: id,
      userId,
    });

    if (!resume) {
      this.logger.warn(
        `用户 ${userId} 查询简历 ${id} 失败：简历不存在或无权访问`,
      );
      throw new BadRequestException('简历不存在');
    }

    return resume;
  }

  /**
   * 更新简历
   * @param id 简历 ID
   * @param updateResumeDto 更新数据
   * @param userId 用户 ID，用于权限验证
   * @returns 更新后的简历对象
   * @throws BadRequestException 当简历不存在或无权访问时
   */
  async update(id: string, updateResumeDto: UpdateResumeDto, userId: string) {
    this.logger.log(`用户 ${userId} 更新简历 ${id}`);

    const resume = await this.resumeModel.findOne({
      _id: id,
      userId,
    });

    if (!resume) {
      this.logger.warn(
        `用户 ${userId} 更新简历 ${id} 失败：简历不存在或无权访问`,
      );
      throw new BadRequestException('简历不存在');
    }

    // 检查是否为模板，模板不允许更新
    if (resume.isTemplate) {
      this.logger.warn(`用户 ${userId} 尝试更新模板简历 ${id}`);
      throw new BadRequestException('模板简历不允许更新');
    }

    const enrichedDto = this.enrichWithSortFields(updateResumeDto);

    const updatedResume = await this.resumeModel.findByIdAndUpdate(
      id,
      {
        ...enrichedDto,
        updatedAt: new Date(),
      },
      {
        new: true,
      },
    );

    this.logger.log(`用户 ${userId} 成功更新简历 ${id}`);
    return updatedResume;
  }

  /**
   * 删除简历
   * @param id 简历 ID
   * @param userId 用户 ID，用于权限验证
   * @returns 被删除的简历对象
   * @throws BadRequestException 当简历不存在或无权访问时
   */
  async remove(id: string, userId: string) {
    this.logger.log(`用户 ${userId} 删除简历 ${id}`);

    const resume = await this.resumeModel.findOneAndDelete({
      _id: id,
      userId,
    });

    if (!resume) {
      this.logger.warn(
        `用户 ${userId} 删除简历 ${id} 失败：简历不存在或无权访问`,
      );
      throw new BadRequestException('简历不存在');
    }

    this.logger.log(`用户 ${userId} 成功删除简历 ${id}`);

    // 级联删除关联的 AI 生成记录、编辑记录、分析记录（尽力而为，不阻塞主删除结果）
    try {
      const [aiResult, editResult, analysisResult] = await Promise.all([
        this.resumeAiModel.deleteMany({
          $or: [{ generatedResumeId: id }, { resumeId: id }],
        }),
        this.editRecordModel.deleteMany({ resumeId: id }),
        this.analysisRecordModel.deleteMany({ resumeId: id }),
      ]);
      this.logger.log(
        `级联删除完成: AI记录${aiResult.deletedCount}条, ` +
          `编辑记录${editResult.deletedCount}条, ` +
          `分析记录${analysisResult.deletedCount}条`,
      );
    } catch (cascadeError) {
      this.logger.error(
        `级联删除关联记录失败（简历 ${id} 已删除）: ${(cascadeError as Error).message}`,
      );
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
    this.logger.log(`用户 ${userId} 尝试复制简历 ${id}`);

    // 校验目标简历是否存在且属于当前用户
    const doc = await this.resumeModel
      .findOne({ _id: id, userId })
      .select('-_id -createdAt -updatedAt -__v -user -userId -isTemplate')
      .exec();

    if (!doc) {
      this.logger.warn(
        `用户 ${userId} 复制简历 ${id} 失败：简历不存在或无权访问`,
      );
      throw new BadRequestException('简历不存在');
    }

    // 检查是否为模板，不允许复制模板
    if (doc.isTemplate) {
      this.logger.warn(`用户 ${userId} 尝试复制模板简历 ${id}`);
      throw new BadRequestException('不允许复制模板简历');
    }

    // 将文档转换为普通对象（已通过 select 排除不需要的字段）
    const sourceObj = doc.toObject() as Partial<Resume> & { title?: string };

    const newTitle = title || `${doc.title ?? '未命名简历'} (副本)`;

    const newResume = await this.resumeModel.create({
      ...(sourceObj as Record<string, unknown>),
      title: newTitle,
      isTemplate: false,
      userId,
      user: new Types.ObjectId(userId),
    });

    this.logger.log(
      `用户 ${userId} 成功复制简历 ${id}，新简历 ID: ${newResume._id.toString()}`,
    );
    return newResume;
  }

  // ──────────────────────────────────────
  //  管理员方法（跨用户，无 userId 限制）
  //  TODO: 当角色系统完善后添加 AdminGuard
  // ──────────────────────────────────────

  /**
   * 管理员查询所有简历（跨用户，分页 + 搜索 + 筛选）
   * @param query 查询参数
   */
  async adminFindAll(query: AdminQueryResumeDto): Promise<{
    items: Resume[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize =
      query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 10;
    const skip = (page - 1) * pageSize;
    const filter: Record<string, unknown> = {};

    // 关键词搜索：标题
    if (query.keyword) {
      const escaped = query.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.title = { $regex: escaped, $options: 'i' };
    }

    // 按用户筛选
    if (query.userId) {
      filter.userId = query.userId;
    }

    // 按类型筛选
    if (query.type) {
      filter.type = query.type;
    }

    // 是否模板
    if (query.isTemplate !== undefined) {
      filter.isTemplate = query.isTemplate;
    }

    const [items, total] = await Promise.all([
      this.resumeModel
        .find(filter)
        .select([
          '_id',
          'userId',
          'title',
          'cover',
          'isTemplate',
          'type',
          'createdAt',
          'updatedAt',
        ])
        .skip(skip)
        .limit(pageSize)
        .sort({ createdAt: -1 })
        .exec(),
      this.resumeModel.countDocuments(filter).exec(),
    ]);

    return { items, total, page, pageSize };
  }

  /**
   * 管理员查看任意简历详情（无 userId 限制）
   * @param id 简历 ID
   * @returns 简历完整数据
   */
  async adminFindOne(id: string): Promise<Resume> {
    const resume = await this.resumeModel.findById(id).exec();
    if (!resume) {
      throw new NotFoundException('简历不存在');
    }
    return resume;
  }

  /**
   * 管理员删除任意简历（无 userId 限制）
   * @param id 简历 ID
   * @returns 被删除的简历
   */
  async adminRemove(id: string): Promise<Resume> {
    const resume = await this.resumeModel.findByIdAndDelete(id).exec();
    if (!resume) {
      throw new NotFoundException('简历不存在');
    }

    this.logger.log(`管理员删除简历 ${id}`);

    // 级联删除关联数据
    try {
      const [aiResult, editResult, analysisResult] = await Promise.all([
        this.resumeAiModel.deleteMany({
          $or: [{ generatedResumeId: id }, { resumeId: id }],
        }),
        this.editRecordModel.deleteMany({ resumeId: id }),
        this.analysisRecordModel.deleteMany({ resumeId: id }),
      ]);
      this.logger.log(
        `级联删除完成: AI记录${aiResult.deletedCount}条, ` +
          `编辑记录${editResult.deletedCount}条, ` +
          `分析记录${analysisResult.deletedCount}条`,
      );
    } catch (cascadeError) {
      this.logger.error(
        `级联删除关联记录失败（简历 ${id} 已删除）: ${(cascadeError as Error).message}`,
      );
    }

    return resume;
  }

  /**
   * 简历统计数据（管理员用）
   * @returns 简历总数、模板数、按类型分布
   */
  async adminGetStats(): Promise<{
    totalResumes: number;
    totalTemplates: number;
    totalNonTemplates: number;
    byType: Record<string, number>;
  }> {
    const [totalResumes, totalTemplates, totalNonTemplates, byType] =
      await Promise.all([
        this.resumeModel.countDocuments().exec(),
        this.resumeModel.countDocuments({ isTemplate: true }).exec(),
        this.resumeModel.countDocuments({ isTemplate: false }).exec(),
        this.resumeModel
          .aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }])
          .exec(),
      ]);

    const typeMap: Record<string, number> = {};
    for (const item of byType) {
      typeMap[item._id || 'default'] = item.count;
    }

    return { totalResumes, totalTemplates, totalNonTemplates, byType: typeMap };
  }
}
