import { Test, TestingModule } from '@nestjs/testing';
import { AdminResumeController } from './admin-resume.controller';
import { ResumeService } from './resume.service';
import { NotFoundException } from '@nestjs/common';

describe('AdminResumeController', () => {
  let controller: AdminResumeController;
  let mockResumeService: any;

  beforeEach(async () => {
    mockResumeService = {
      adminFindAll: jest.fn(),
      adminFindOne: jest.fn(),
      adminRemove: jest.fn(),
      adminGetStats: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminResumeController],
      providers: [
        {
          provide: ResumeService,
          useValue: mockResumeService,
        },
      ],
    }).compile();

    controller = module.get<AdminResumeController>(AdminResumeController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('应返回分页简历列表', async () => {
      const mockResult = {
        items: [
          { _id: '1', title: '简历1', userId: 'u1' },
          { _id: '2', title: '简历2', userId: 'u2' },
        ],
        total: 2,
        page: 1,
        pageSize: 10,
      };
      mockResumeService.adminFindAll.mockResolvedValue(mockResult);

      const result = await controller.findAll({
        page: 1,
        pageSize: 10,
        keyword: '简历',
      });

      expect(result).toEqual(mockResult);
      expect(mockResumeService.adminFindAll).toHaveBeenCalledWith({
        page: 1,
        pageSize: 10,
        keyword: '简历',
      });
    });

    it('无查询参数时应使用默认值', async () => {
      const mockResult = { items: [], total: 0, page: 1, pageSize: 10 };
      mockResumeService.adminFindAll.mockResolvedValue(mockResult);

      await controller.findAll({});

      expect(mockResumeService.adminFindAll).toHaveBeenCalledWith({});
    });

    it('应按 userId 筛选', async () => {
      mockResumeService.adminFindAll.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
      });

      await controller.findAll({ userId: 'user-1' });

      expect(mockResumeService.adminFindAll).toHaveBeenCalledWith({
        userId: 'user-1',
      });
    });

    it('应按 isTemplate 筛选', async () => {
      mockResumeService.adminFindAll.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 10,
      });

      await controller.findAll({ isTemplate: true });

      expect(mockResumeService.adminFindAll).toHaveBeenCalledWith({
        isTemplate: true,
      });
    });
  });

  describe('getStats', () => {
    it('应返回简历统计数据', async () => {
      const mockStats = {
        totalResumes: 200,
        totalTemplates: 20,
        totalNonTemplates: 180,
        byType: { default: 150, creative: 50 },
      };
      mockResumeService.adminGetStats.mockResolvedValue(mockStats);

      const result = await controller.getStats();

      expect(result).toEqual(mockStats);
      expect(mockResumeService.adminGetStats).toHaveBeenCalledTimes(1);
    });
  });

  describe('findOne', () => {
    it('应返回简历详情', async () => {
      const mockResume = {
        _id: 'resume-1',
        title: '我的简历',
        userId: 'user-1',
        basicInfo: { name: '张三' },
      };
      mockResumeService.adminFindOne.mockResolvedValue(mockResume);

      const result = await controller.findOne('resume-1');

      expect(result).toEqual(mockResume);
      expect(mockResumeService.adminFindOne).toHaveBeenCalledWith('resume-1');
    });

    it('简历不存在时应抛 NotFoundException', async () => {
      mockResumeService.adminFindOne.mockRejectedValue(
        new NotFoundException('简历不存在'),
      );

      await expect(controller.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('应删除简历并返回结果', async () => {
      const mockDeleted = {
        _id: 'resume-1',
        title: '我的简历',
      };
      mockResumeService.adminRemove.mockResolvedValue(mockDeleted);

      const result = await controller.remove('resume-1');

      expect(result).toEqual(mockDeleted);
      expect(mockResumeService.adminRemove).toHaveBeenCalledWith('resume-1');
    });

    it('简历不存在时应抛 NotFoundException', async () => {
      mockResumeService.adminRemove.mockRejectedValue(
        new NotFoundException('简历不存在'),
      );

      await expect(controller.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
