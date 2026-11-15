import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

/**
 * 管理员系统管理控制器
 *
 * 路由前缀: /api/v1/admin
 * 鉴权：JwtAuthGuard（登录）+ AdminGuard（ADMIN_EMAILS 白名单）
 */
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * 系统仪表盘概览
   * GET /api/v1/admin/dashboard
   *
   * @returns 用户/简历/模板/AI调用等关键指标
   */
  @Get('dashboard')
  async getDashboard() {
    return this.adminService.getDashboard();
  }
}
