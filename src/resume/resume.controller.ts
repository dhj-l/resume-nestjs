import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  Res,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ParseObjectIdPipe } from '@nestjs/mongoose';
import type { Response } from 'express';
import type { Request } from 'express';
import { ResumeService } from './resume.service';
import { CreateResumeDto } from './dto/create-resume.dto';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { DownloadResumeDto } from './dto/download-resume.dto';
import { CopyResumeDto } from './dto/copy-resume.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { GetResumeDto } from './dto/get-resume.dto';

/**
 * 为请求对象增加用户类型,避免 any 引发的类型风险
 */
interface RequestWithUser extends Request {
  user: {
    userId: string;
    username: string;
    email: string;
    role?: string;
  };
}

@Controller('resume')
@UseGuards(JwtAuthGuard)
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  /**
   * 下载简历 PDF
   * 接收 html 和 css，返回 pdf 流
   */
  @Post('download')
  async download(
    @Body() downloadResumeDto: DownloadResumeDto,
    @Res() res: Response,
  ) {
    const buffer = await this.resumeService.downloadResume(downloadResumeDto);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="resume.pdf"',
      'Content-Length': buffer.length.toString(),
    });
    res.end(buffer);
  }

  /**
   * 创建简历
   * 支持根据模板 ID 创建或创建空白简历
   * 需要登录认证
   */
  @Post()
  create(
    @Body() createResumeDto: CreateResumeDto,
    @Req() req: RequestWithUser,
  ) {
    const { userId } = req.user;
    return this.resumeService.create(userId, createResumeDto);
  }

  /**
   * 查找所有模板简历
   * 需要登录认证
   */
  @Get('templates')
  findAllTemplates() {
    return this.resumeService.findAllTemplates();
  }

  /**
   * 查找用户所有非模板简历（分页）
   * 需要登录认证
   */
  @Get()
  findAll(@Req() req: RequestWithUser, @Query() query: GetResumeDto) {
    const { userId } = req.user;
    return this.resumeService.findAll(userId, query);
  }

  /**
   * 查找单个简历
   * 需要登录认证，只允许用户查看自己的简历
   */
  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: string, @Req() req: RequestWithUser) {
    const { userId } = req.user;
    return this.resumeService.findOne(id, userId);
  }

  /**
   * 复制简历
   * 根据简历 ID 复制当前用户的简历，返回新简历
   * 需要登录认证，只允许用户复制自己的简历
   */
  @Post(':id/copy')
  copy(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() body: CopyResumeDto,
    @Req() req: RequestWithUser,
  ) {
    const { userId } = req.user;
    return this.resumeService.copy(id, userId, body?.title);
  }

  /**
   * 更新简历
   * 需要登录认证，只允许用户修改自己的简历
   */
  @Patch(':id')
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() updateResumeDto: UpdateResumeDto,
    @Req() req: RequestWithUser,
  ) {
    const { userId } = req.user;
    return this.resumeService.update(id, updateResumeDto, userId);
  }

  /**
   * 删除简历
   * 需要登录认证，只允许用户删除自己的简历
   */
  @Delete(':id')
  remove(@Param('id', ParseObjectIdPipe) id: string, @Req() req: RequestWithUser) {
    const { userId } = req.user;
    return this.resumeService.remove(id, userId);
  }
}
