import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

describe('AdminController', () => {
  let controller: AdminController;
  let mockAdminService: any;

  beforeEach(async () => {
    mockAdminService = {
      getDashboard: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: mockAdminService,
        },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDashboard', () => {
    it('应返回仪表盘概览数据', async () => {
      const mockDashboard = {
        users: { total: 100, newThisMonth: 15 },
        resumes: { total: 200, templates: 20 },
        templates: { total: 30 },
        aiCalls: { total: 500, today: 12, successRate: 0.92 },
      };
      mockAdminService.getDashboard.mockResolvedValue(mockDashboard);

      const result = await controller.getDashboard();

      expect(result).toEqual(mockDashboard);
      expect(mockAdminService.getDashboard).toHaveBeenCalledTimes(1);
    });

    it('空数据时应返回零值', async () => {
      const mockDashboard = {
        users: { total: 0, newThisMonth: 0 },
        resumes: { total: 0, templates: 0 },
        templates: { total: 0 },
        aiCalls: { total: 0, today: 0, successRate: 0 },
      };
      mockAdminService.getDashboard.mockResolvedValue(mockDashboard);

      const result = await controller.getDashboard();

      expect(result).toEqual(mockDashboard);
    });

    it('服务层抛错时应透传', async () => {
      const error = new Error('数据库连接失败');
      mockAdminService.getDashboard.mockRejectedValue(error);

      await expect(controller.getDashboard()).rejects.toThrow('数据库连接失败');
    });
  });
});
