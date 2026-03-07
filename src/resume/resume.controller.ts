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
import type { Response } from 'express';
import { ResumeService } from './resume.service';
import { CreateResumeDto } from './dto/create-resume.dto';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { DownloadResumeDto } from './dto/download-resume.dto';
import { CopyResumeDto } from './dto/copy-resume.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { GetResumeDto } from './dto/get-resume.dto';

@Controller('resume')
@UseGuards(JwtAuthGuard)
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  /**
   * 下载简历
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
   */
  @Post()
  create(@Body() createResumeDto: CreateResumeDto, @Req() req) {
    const { userId } = req.user;
    return this.resumeService.create(userId, createResumeDto);
  }

  @Get('templates')
  findAllTemplates() {
    return this.resumeService.findAllTemplates();
  }

  @Get()
  findAll(@Req() req, @Query() query: GetResumeDto) {
    const { userId } = req.user;
    return this.resumeService.findAll(userId, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req) {
    const { userId } = req.user;
    return this.resumeService.findOne(id, userId);
  }

  /**
   * 复制简历
   * 根据简历 ID 复制当前用户的简历，返回新简历
   */
  @Post(':id/copy')
  copy(@Param('id') id: string, @Body() body: CopyResumeDto, @Req() req) {
    const { userId } = req.user;
    return this.resumeService.copy(id, userId, body?.title);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateResumeDto: UpdateResumeDto,
    @Req() req,
  ) {
    const { userId } = req.user;
    return this.resumeService.update(id, updateResumeDto, userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req) {
    const { userId } = req.user;
    return this.resumeService.remove(id, userId);
  }
}
