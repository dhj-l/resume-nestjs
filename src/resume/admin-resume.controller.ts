import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ResumeService } from './resume.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminQueryResumeDto } from './dto/admin-query-resume.dto';

/**
 * 管理员简历管理控制器
 *
 * 路由前缀: /api/v1/admin/resumes
 * TODO: 当角色系统完善后添加 AdminGuard 限制仅管理员可访问
 */
@Controller('admin/resumes')
@UseGuards(JwtAuthGuard)
export class AdminResumeController {
  private readonly logger = new Logger(AdminResumeController.name);

  constructor(private readonly resumeService: ResumeService) {}

  /**
   * 查询所有简历（跨用户，分页 + 搜索 + 筛选）
   * GET /api/v1/admin/resumes
   */
  @Get()
  async findAll(@Query() query: AdminQueryResumeDto) {
    this.logger.log('管理员查询简历列表');
    return this.resumeService.adminFindAll(query);
  }

  /**
   * 获取简历统计数据
   * GET /api/v1/admin/resumes/stats
   * 注意：必须放在 :id 之前，否则 NestJS 会将 'stats' 当作 :id 参数
   */
  @Get('stats')
  async getStats() {
    this.logger.log('管理员查询简历统计数据');
    return this.resumeService.adminGetStats();
  }

  /**
   * 查看任意简历详情（无 userId 限制）
   * GET /api/v1/admin/resumes/:id
   */
  @Get(':id')
  async findOne(@Param('id') id: string) {
    this.logger.log(`管理员查看简历 ${id}`);
    return this.resumeService.adminFindOne(id);
  }

  /**
   * 删除任意简历（无 userId 限制）
   * DELETE /api/v1/admin/resumes/:id
   */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    this.logger.log(`管理员删除简历 ${id}`);
    return this.resumeService.adminRemove(id);
  }
}
