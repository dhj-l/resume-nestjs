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
} from '@nestjs/common';
import type { Response } from 'express';
import { ResumeService } from './resume.service';
import { UpdateResumeDto } from './dto/update-resume.dto';
import { DownloadResumeDto } from './dto/download-resume.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

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
   * TODO 创建不需要很多参数，默认值就好
   * 后续根据模板Id来创建
   */
  @Post()
  create(@Req() req) {
    const { userId } = req.user;
    return this.resumeService.create(userId);
  }

  @Get('templates')
  findAllTemplates() {
    return this.resumeService.findAllTemplates();
  }

  @Get()
  findAll(@Req() req) {
    const { userId } = req.user;
    return this.resumeService.findAll(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req) {
    const { userId } = req.user;
    return this.resumeService.findOne(id, userId);
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
