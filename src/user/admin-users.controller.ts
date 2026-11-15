import { Controller, Get, UseGuards, Logger } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

/**
 * 管理员用户管理控制器
 *
 * 路由前缀: /api/v1/admin/users
 * 鉴权：JwtAuthGuard（登录）+ AdminGuard（ADMIN_EMAILS 白名单）
 */
@Controller('admin/users')
@UseGuards(JwtAuthGuard, AdminGuard)
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
