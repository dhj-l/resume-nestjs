import { Controller, Get, UseGuards, Logger } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

/**
 * 管理员用户管理控制器
 *
 * 路由前缀: /api/v1/admin/users
 * TODO: 当角色系统完善后添加 AdminGuard 限制仅管理员可访问
 */
@Controller('admin/users')
@UseGuards(JwtAuthGuard)
export class AdminUsersController {
  private readonly logger = new Logger(AdminUsersController.name);

  constructor(private readonly userService: UserService) {}

  /**
   * 获取用户统计数据
   * GET /api/v1/admin/users/stats
   *
   * @returns 用户总数、本月新增、按注册来源分布
   */
  @Get('stats')
  async getStats() {
    this.logger.log('查询用户统计数据');
    return this.userService.getUserStats();
  }
}
