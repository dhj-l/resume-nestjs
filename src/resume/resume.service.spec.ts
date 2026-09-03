import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { ResumeService } from './resume.service';

/* ------------------------------------------------------------------ */
/*  Puppeteer mock                                                    */
/* ------------------------------------------------------------------ */

// 用 jest.mock 拦截顶层 import，必须在模块加载之前定义

let mockBrowserInstance: any = null;
let mockDisconnectHandler: (() => void) | null = null;

const mockPage = {
  setContent: jest.fn().mockResolvedValue(undefined),
  waitForFunction: jest.fn().mockResolvedValue(undefined),
  addStyleTag: jest.fn().mockResolvedValue(undefined),
  evaluate: jest.fn().mockResolvedValue(undefined),
  pdf: jest.fn().mockResolvedValue(Buffer.from('fake-pdf-content')),
  close: jest.fn().mockResolvedValue(undefined),
};

function createMockBrowser() {
  mockDisconnectHandler = null;
  return {
    isConnected: jest.fn().mockReturnValue(true),
    newPage: jest.fn().mockResolvedValue(mockPage),
    close: jest.fn().mockImplementation(() => {
      // close 时触发 disconnected 回调
      if (mockDisconnectHandler) mockDisconnectHandler();
      return Promise.resolve();
    }),
    on: jest.fn().mockImplementation((event: string, handler: () => void) => {
      if (event === 'disconnected') {
        mockDisconnectHandler = handler;
      }
    }),
  };
}

jest.mock('puppeteer', () => ({
  launch: jest.fn().mockImplementation(() => {
    const b = createMockBrowser();
    mockBrowserInstance = b;
    return Promise.resolve(b);
  }),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn().mockReturnValue('/* mock tailwind css */'),
  existsSync: jest.fn().mockReturnValue(false),
}));

/* ------------------------------------------------------------------ */
/*  Helper: build mock Mongoose Model                                 */
/* ------------------------------------------------------------------ */

function buildMockModel() {
  const exec = jest.fn().mockResolvedValue(null);
  const select = jest.fn().mockReturnThis();
  const findById = jest.fn().mockReturnValue({ select, exec });
  const findOne = jest.fn().mockReturnValue({ select, exec });
  const find = jest.fn().mockReturnValue({
    select,
    exec,
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
  });
  const findOneAndUpdate = jest.fn().mockReturnValue({ select, exec });
  const findByIdAndUpdate = jest.fn().mockReturnValue({ select, exec });
  const findByIdAndDelete = jest.fn().mockReturnValue({ exec });
  const create = jest.fn();
  const countDocuments = jest
    .fn()
    .mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });

  return {
    findById,
    findOne,
    find,
    findOneAndUpdate,
    findByIdAndUpdate,
    findByIdAndDelete,
    create,
    countDocuments,
  };
}

/* ------------------------------------------------------------------ */
/*  测试套件                                                          */
/* ------------------------------------------------------------------ */
describe('ResumeService — Puppeteer 浏览器生命周期', () => {
  let service: ResumeService;
  let puppeteer: any;

  beforeAll(async () => {
    puppeteer = require('puppeteer'); // eslint-disable-line @typescript-eslint/no-require-imports
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    mockBrowserInstance = null;
    mockDisconnectHandler = null;
    mockPage.pdf.mockResolvedValue(Buffer.from('fake-pdf-content'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResumeService,
        { provide: getModelToken('Resume'), useValue: buildMockModel() },
        { provide: getModelToken('Template'), useValue: buildMockModel() },
        { provide: getModelToken('ResumeAi'), useValue: buildMockModel() },
        {
          provide: getModelToken('ResumeEditRecord'),
          useValue: buildMockModel(),
        },
        {
          provide: getModelToken('ResumeAnalysisRecord'),
          useValue: buildMockModel(),
        },
      ],
    }).compile();

    service = module.get<ResumeService>(ResumeService);
  });

  const callDownload = () =>
    service.downloadResume({
      html: '<div>test</div>',
      css: 'body { margin: 0; }',
    });

  /* ================================================================ */
  /*  浏览器复用                                                        */
  /* ================================================================ */
  describe('浏览器实例复用', () => {
    it('多次调用 downloadResume 应复用同一个浏览器实例', async () => {
      await callDownload();
      await callDownload();

      // puppeteer.launch 只应调用 1 次
      expect(puppeteer.launch).toHaveBeenCalledTimes(1);
      // newPage 应调用 2 次（每次请求新建页面）
      expect(mockBrowserInstance.newPage).toHaveBeenCalledTimes(2);
    });

    it('每次请求后应关闭 page，但不关闭 browser', async () => {
      await callDownload();

      expect(mockPage.close).toHaveBeenCalledTimes(1);
      expect(mockBrowserInstance.close).not.toHaveBeenCalled();
    });

    it('首次调用后才创建浏览器实例（懒加载）', async () => {
      // 服务初始化后 browser 应为 null
      expect(mockBrowserInstance).toBeNull();

      await callDownload();

      expect(puppeteer.launch).toHaveBeenCalledTimes(1);
      expect(mockBrowserInstance).not.toBeNull();
    });
  });

  /* ================================================================ */
  /*  浏览器断开后重建                                                  */
  /* ================================================================ */
  describe('浏览器断开后自动重建', () => {
    it('浏览器断开后下次请求应重新创建', async () => {
      await callDownload();
      expect(puppeteer.launch).toHaveBeenCalledTimes(1);

      // 模拟浏览器断开
      expect(mockDisconnectHandler).not.toBeNull();
      mockDisconnectHandler!();

      // 下一次调用应重新 launch
      await callDownload();
      expect(puppeteer.launch).toHaveBeenCalledTimes(2);
    });

    it('isConnected 返回 false 时应重建', async () => {
      await callDownload();
      expect(puppeteer.launch).toHaveBeenCalledTimes(1);

      // 标记浏览器已断开（但还没触发 on('disconnected')）
      mockBrowserInstance.isConnected.mockReturnValue(false);

      await callDownload();
      expect(puppeteer.launch).toHaveBeenCalledTimes(2);
    });
  });

  /* ================================================================ */
  /*  并发安全                                                         */
  /* ================================================================ */
  describe('并发安全', () => {
    it('并发请求应共享同一个初始化 Promise', async () => {
      // 延迟 launch 响应，模拟慢速初始化
      let resolveLaunch: (v: any) => void;
      puppeteer.launch.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveLaunch = resolve;
          }),
      );

      // 同时发起两个请求
      const p1 = callDownload();
      const p2 = callDownload();

      // 两个请求都应等待同一个初始化
      const browser = createMockBrowser();
      resolveLaunch!(browser);
      mockBrowserInstance = browser;

      await Promise.all([p1, p2]);

      // launch 只调用 1 次
      expect(puppeteer.launch).toHaveBeenCalledTimes(1);
      // 两个页面都被创建
      expect(browser.newPage).toHaveBeenCalledTimes(2);
    });
  });

  /* ================================================================ */
  /*  模块销毁清理                                                     */
  /* ================================================================ */
  describe('onModuleDestroy', () => {
    it('应关闭浏览器实例', async () => {
      await callDownload();
      expect(mockBrowserInstance).not.toBeNull();

      await service.onModuleDestroy();

      expect(mockBrowserInstance.close).toHaveBeenCalledTimes(1);
    });

    it('未初始化浏览器时调用不应抛错', async () => {
      // 从未调用 downloadResume，browser 为 null
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });

    it('close 失败时不应抛出异常', async () => {
      await callDownload();
      mockBrowserInstance.close.mockRejectedValueOnce(
        new Error('close failed'),
      );

      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });
  });

  /* ================================================================ */
  /*  PDF 生成仍正常工作                                               */
  /* ================================================================ */
  describe('PDF 生成功能', () => {
    it('应返回 PDF Buffer', async () => {
      const result = await callDownload();

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString()).toBe('fake-pdf-content');
    });

    it('page.pdf 出错时应在 finally 中关闭页面', async () => {
      mockPage.pdf.mockRejectedValueOnce(new Error('PDF generation error'));

      await expect(callDownload()).rejects.toThrow(BadRequestException);

      // 即使出错，page 仍被关闭
      expect(mockPage.close).toHaveBeenCalledTimes(1);
      // browser 不被关闭
      expect(mockBrowserInstance.close).not.toHaveBeenCalled();
    });
  });
});

/* ------------------------------------------------------------------ */
/*  ResumeService — 管理员方法 (adminFindAll / adminFindOne /          */
/*                  adminRemove / adminGetStats)                       */
/* ------------------------------------------------------------------ */

describe('ResumeService — 管理员方法', () => {
  let service: ResumeService;
  let mockResumeModel: any;
  let mockAiModel: any;
  let mockEditRecordModel: any;
  let mockAnalysisRecordModel: any;
  let mockTemplateModel: any;

  beforeEach(async () => {
    // 构建支持分页的 mock
    const chainObj = {
      select: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      exec: jest.fn(),
    };

    mockResumeModel = {
      find: jest.fn().mockReturnValue(chainObj),
      findById: jest.fn(),
      findByIdAndDelete: jest.fn(),
      countDocuments: jest.fn(),
      aggregate: jest.fn(),
    };

    mockAiModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    mockEditRecordModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    mockAnalysisRecordModel = {
      deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 }),
    };
    mockTemplateModel = buildMockModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResumeService,
        {
          provide: getModelToken('Resume'),
          useValue: mockResumeModel,
        },
        {
          provide: getModelToken('Template'),
          useValue: mockTemplateModel,
        },
        {
          provide: getModelToken('ResumeAi'),
          useValue: mockAiModel,
        },
        {
          provide: getModelToken('ResumeEditRecord'),
          useValue: mockEditRecordModel,
        },
        {
          provide: getModelToken('ResumeAnalysisRecord'),
          useValue: mockAnalysisRecordModel,
        },
      ],
    }).compile();

    service = module.get<ResumeService>(ResumeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /* ================================================================ */
  /*  adminFindAll                                                     */
  /* ================================================================ */
  describe('adminFindAll', () => {
    it('应返回分页结果（默认参数）', async () => {
      const mockItems = [
        { _id: 'r1', title: '简历1', userId: 'u1' },
        { _id: 'r2', title: '简历2', userId: 'u2' },
      ];
      mockResumeModel.find().exec.mockResolvedValue(mockItems);
      mockResumeModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(2),
      });

      const result = await service.adminFindAll({});

      expect(result).toEqual({
        items: mockItems,
        total: 2,
        page: 1,
        pageSize: 10,
      });
      expect(mockResumeModel.find).toHaveBeenCalledWith({});
    });

    it('应按关键词搜索标题', async () => {
      mockResumeModel.find().exec.mockResolvedValue([]);
      mockResumeModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });

      await service.adminFindAll({ keyword: '前端' });

      expect(mockResumeModel.find).toHaveBeenCalledWith({
        title: { $regex: '前端', $options: 'i' },
      });
    });

    it('应按 userId 筛选', async () => {
      mockResumeModel.find().exec.mockResolvedValue([]);
      mockResumeModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });

      await service.adminFindAll({ userId: 'user-1' });

      expect(mockResumeModel.find).toHaveBeenCalledWith({
        userId: 'user-1',
      });
    });

    it('应按 type 筛选', async () => {
      mockResumeModel.find().exec.mockResolvedValue([]);
      mockResumeModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });

      await service.adminFindAll({ type: 'creative' });

      expect(mockResumeModel.find).toHaveBeenCalledWith({
        type: 'creative',
      });
    });

    it('isTemplate=true 应筛选模板简历', async () => {
      mockResumeModel.find().exec.mockResolvedValue([]);
      mockResumeModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });

      await service.adminFindAll({ isTemplate: true });

      expect(mockResumeModel.find).toHaveBeenCalledWith({
        isTemplate: true,
      });
    });

    it('isTemplate=false 应筛选非模板简历', async () => {
      mockResumeModel.find().exec.mockResolvedValue([]);
      mockResumeModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });

      await service.adminFindAll({ isTemplate: false });

      expect(mockResumeModel.find).toHaveBeenCalledWith({
        isTemplate: false,
      });
    });

    it('isTemplate 为 undefined 时不应加入筛选', async () => {
      mockResumeModel.find().exec.mockResolvedValue([]);
      mockResumeModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });

      await service.adminFindAll({});

      expect(mockResumeModel.find).toHaveBeenCalledWith({});
    });

    it('应支持自定义分页', async () => {
      mockResumeModel.find().exec.mockResolvedValue([]);
      mockResumeModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(100),
      });

      const result = await service.adminFindAll({ page: 5, pageSize: 25 });

      expect(result.page).toBe(5);
      expect(result.pageSize).toBe(25);

      const chain = mockResumeModel.find();
      expect(chain.skip).toHaveBeenCalledWith(100);
      expect(chain.limit).toHaveBeenCalledWith(25);
    });

    it('pageSize 超过 100 时应限制为 100', async () => {
      mockResumeModel.find().exec.mockResolvedValue([]);
      mockResumeModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });

      const result = await service.adminFindAll({ pageSize: 999 });

      expect(result.pageSize).toBe(100);
    });

    it('应排除敏感字段只返回列表字段', async () => {
      mockResumeModel.find().exec.mockResolvedValue([]);
      mockResumeModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      });

      await service.adminFindAll({});

      const chain = mockResumeModel.find();
      expect(chain.select).toHaveBeenCalledWith([
        '_id',
        'userId',
        'title',
        'cover',
        'isTemplate',
        'type',
        'createdAt',
        'updatedAt',
      ]);
    });
  });

  /* ================================================================ */
  /*  adminFindOne                                                     */
  /* ================================================================ */
  describe('adminFindOne', () => {
    it('应返回简历详情', async () => {
      const mockResume = {
        _id: 'resume-1',
        title: '我的简历',
        userId: 'user-1',
        basicInfo: { name: '张三' },
      };
      mockResumeModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockResume),
      });

      const result = await service.adminFindOne('resume-1');

      expect(result).toEqual(mockResume);
      expect(mockResumeModel.findById).toHaveBeenCalledWith('resume-1');
    });

    it('简历不存在时应抛 NotFoundException', async () => {
      mockResumeModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.adminFindOne('nonexistent')).rejects.toThrow(
        '简历不存在',
      );
    });
  });

  /* ================================================================ */
  /*  adminRemove                                                      */
  /* ================================================================ */
  describe('adminRemove', () => {
    it('应删除简历并返回被删除的文档', async () => {
      const mockDeleted = {
        _id: 'resume-1',
        title: '我的简历',
      };
      mockResumeModel.findByIdAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDeleted),
      });

      const result = await service.adminRemove('resume-1');

      expect(result).toEqual(mockDeleted);
      expect(mockResumeModel.findByIdAndDelete).toHaveBeenCalledWith(
        'resume-1',
      );
    });

    it('应级联删除关联的 AI/编辑/分析记录', async () => {
      mockResumeModel.findByIdAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'resume-1' }),
      });
      mockAiModel.deleteMany.mockResolvedValue({ deletedCount: 3 });
      mockEditRecordModel.deleteMany.mockResolvedValue({ deletedCount: 2 });
      mockAnalysisRecordModel.deleteMany.mockResolvedValue({
        deletedCount: 1,
      });

      await service.adminRemove('resume-1');

      expect(mockAiModel.deleteMany).toHaveBeenCalledWith({
        $or: [{ generatedResumeId: 'resume-1' }, { resumeId: 'resume-1' }],
      });
      expect(mockEditRecordModel.deleteMany).toHaveBeenCalledWith({
        resumeId: 'resume-1',
      });
      expect(mockAnalysisRecordModel.deleteMany).toHaveBeenCalledWith({
        resumeId: 'resume-1',
      });
    });

    it('级联删除失败不应阻塞主流程', async () => {
      mockResumeModel.findByIdAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'resume-1' }),
      });
      mockAiModel.deleteMany.mockRejectedValue(new Error('删除关联数据失败'));

      const result = await service.adminRemove('resume-1');

      // 主删除成功
      expect(result).toEqual({ _id: 'resume-1' });
    });

    it('简历不存在时应抛 NotFoundException', async () => {
      mockResumeModel.findByIdAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.adminRemove('nonexistent')).rejects.toThrow(
        '简历不存在',
      );
    });
  });

  /* ================================================================ */
  /*  adminGetStats                                                    */
  /* ================================================================ */
  describe('adminGetStats', () => {
    /**
     * adminGetStats 中 countDocuments 调用方式:
     *   countDocuments().exec()
     *   countDocuments({ isTemplate: true }).exec()
     *   countDocuments({ isTemplate: false }).exec()
     * 所以 mock 必须返回 { exec: fn } 链式对象
     */
    it('应返回简历统计数据', async () => {
      mockResumeModel.countDocuments = jest.fn((filter?: any) => ({
        exec: jest.fn().mockResolvedValue(
          (() => {
            if (!filter || Object.keys(filter).length === 0) return 220;
            if (filter?.isTemplate === true) return 20;
            if (filter?.isTemplate === false) return 200;
            return 0;
          })(),
        ),
      }));
      mockResumeModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { _id: 'default', count: 150 },
          { _id: 'creative', count: 50 },
          { _id: 'classic', count: 20 },
        ]),
      });

      const result = await service.adminGetStats();

      expect(result.totalResumes).toBe(220);
      expect(result.totalTemplates).toBe(20);
      expect(result.totalNonTemplates).toBe(200);
      expect(result.byType).toEqual({
        default: 150,
        creative: 50,
        classic: 20,
      });
    });

    it('空数据库时应返回零值', async () => {
      mockResumeModel.countDocuments = jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(0),
      }));
      mockResumeModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });

      const result = await service.adminGetStats();

      expect(result.totalResumes).toBe(0);
      expect(result.totalTemplates).toBe(0);
      expect(result.totalNonTemplates).toBe(0);
      expect(result.byType).toEqual({});
    });

    it('_id 为 undefined 时应映射为 default', async () => {
      mockResumeModel.countDocuments = jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(10),
      }));
      mockResumeModel.aggregate.mockReturnValue({
        exec: jest.fn().mockResolvedValue([{ _id: undefined, count: 10 }]),
      });

      const result = await service.adminGetStats();

      expect(result.byType).toEqual({ default: 10 });
    });
  });
});

/* ------------------------------------------------------------------ */
/*  ResumeService — 用户简历列表 findAll                                */
/* ------------------------------------------------------------------ */

describe('ResumeService — 用户简历列表 findAll', () => {
  let service: ResumeService;
  let chainObj: any;

  beforeEach(async () => {
    chainObj = {
      select: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };

    const mockResumeModel = {
      find: jest.fn().mockReturnValue(chainObj),
      countDocuments: jest.fn().mockResolvedValue(2),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResumeService,
        { provide: getModelToken('Resume'), useValue: mockResumeModel },
        { provide: getModelToken('Template'), useValue: buildMockModel() },
        { provide: getModelToken('ResumeAi'), useValue: {} },
        { provide: getModelToken('ResumeEditRecord'), useValue: {} },
        { provide: getModelToken('ResumeAnalysisRecord'), useValue: {} },
      ],
    }).compile();

    service = module.get<ResumeService>(ResumeService);
  });

  it('应返回分页列表并包含 aiStatus 字段', async () => {
    const list = [
      { _id: 'r1', title: '张三-前端', aiStatus: 'generating', userId: 'u1' },
      { _id: 'r2', title: '李四-后端', aiStatus: '', userId: 'u1' },
    ];
    chainObj.exec.mockResolvedValue(list);

    const result = await service.findAll('u1', { page: 1, pageSize: 6 });

    expect(result.list).toEqual(list);
    expect(result.total).toBe(2);
    expect(chainObj.select).toHaveBeenCalledWith(
      expect.arrayContaining(['aiStatus', '_id', 'title']),
    );
    expect(chainObj.skip).toHaveBeenCalledWith(0);
    expect(chainObj.limit).toHaveBeenCalledWith(6);
  });
});
