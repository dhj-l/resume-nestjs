import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { ResumeService } from './resume.service';
import { readFileSync } from 'fs';

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
    puppeteer = require('puppeteer');
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
