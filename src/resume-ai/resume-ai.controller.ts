import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ResumeAiService } from './resume-ai.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { CreateAiResuemDto } from './dto/createAiResuem.dto';

@Controller('resume-ai')
@UseGuards(JwtAuthGuard)
export class ResumeAiController {
  constructor(private readonly resumeAiService: ResumeAiService) {}
  @Post('generate')
  async generateResume(
    @Body() createAiResuemDto: CreateAiResuemDto,
    @Req() req,
  ) {
    try {
      const { userId } = req.user;
      return this.resumeAiService.generateResume(createAiResuemDto, userId);
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }
}
