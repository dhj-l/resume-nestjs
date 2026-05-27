import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  InternalServerErrorException,
  Logger,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiUsageRecordService } from './ai-usage-record.service';
import { QueryAiUsageRecordDto } from './dto/query-ai-usage-record.dto';

// TODO: 当角色系统引入后，添加 AdminGuard 限制仅管理员可访问
@Controller('admin/ai-usage-records')
@UseGuards(JwtAuthGuard)
export class AiUsageRecordController {
  private readonly logger = new Logger(AiUsageRecordController.name);

  constructor(private readonly aiUsageRecordService: AiUsageRecordService) {}

  @Get()
  async findAll(@Query() query: QueryAiUsageRecordDto) {
    try {
      return await this.aiUsageRecordService.findAll(query);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      return await this.aiUsageRecordService.findById(id);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
    }
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    try {
      return await this.aiUsageRecordService.remove(id);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(error.message, error.stack);
      throw new InternalServerErrorException('服务器内部错误');
    }
  }
}
