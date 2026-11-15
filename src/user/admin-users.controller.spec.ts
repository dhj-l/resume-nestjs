import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AdminUsersController } from './admin-users.controller';
import { UserService } from './user.service';

describe('AdminUsersController', () => {
  let controller: AdminUsersController;
  let mockUserService: any;

  beforeEach(async () => {
    mockUserService = {
      getUserStats: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [
        // AdminGuard 依赖 ConfigService（管理端接口鉴权），单测里给一个 stub
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    controller = module.get<AdminUsersController>(AdminUsersController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getStats', () => {
    it('应返回用户统计数据', async () => {
      const mockStats = {
        totalUsers: 100,
        newThisMonth: 15,
        byPlatform: { email: 60, github: 25, gitee: 10, qq: 5 },
      };
      mockUserService.getUserStats.mockResolvedValue(mockStats);

      const result = await controller.getStats();

      expect(result).toEqual(mockStats);
      expect(mockUserService.getUserStats).toHaveBeenCalledTimes(1);
    });

    it('应透传服务层的错误', async () => {
      const error = new Error('数据库连接失败');
      mockUserService.getUserStats.mockRejectedValue(error);

      await expect(controller.getStats()).rejects.toThrow('数据库连接失败');
    });
  });
});
