import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { TemplateService } from './template.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TemplateQueryDto } from './dto/template-query.dto';

@Controller('template')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() createTemplateDto: CreateTemplateDto, @Req() req) {
    const { userId } = req.user;
    return this.templateService.create(createTemplateDto, userId);
  }

  @Get()
  findAll(@Query() query: TemplateQueryDto) {
    return this.templateService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.templateService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() updateTemplateDto: UpdateTemplateDto,
    @Req() req,
  ) {
    const { userId } = req.user;
    return this.templateService.update(id, updateTemplateDto, userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @Req() req) {
    const { userId } = req.user;
    return this.templateService.remove(id, userId);
  }
}
