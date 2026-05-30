import { Test, TestingModule } from '@nestjs/testing';
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
