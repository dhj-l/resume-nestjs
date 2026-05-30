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

@Controller('template')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  /**
   * 创建模板
   * 需要登录认证，任何登录用户都可以创建模板
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Body() createTemplateDto: CreateTemplateDto,
    @Req() req: RequestWithUser,
  ) {
    const { userId } = req.user;
    return this.templateService.create(createTemplateDto, userId);
  }

  /**
   * 查询模板列表
   * 公开接口，所有用户都可以查看模板列表
   */
  @Get()
  findAll(@Query() query: TemplateQueryDto) {
    return this.templateService.findAll(query);
  }

  /**
   * 查询单个模板详情
   * 公开接口，所有用户都可以查看模板详情
   */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.templateService.findOne(id);
  }

  /**
   * 更新模板
   * 需要登录认证，只允许用户修改自己的模板
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() updateTemplateDto: UpdateTemplateDto,
    @Req() req: RequestWithUser,
  ) {
    const { userId } = req.user;
    return this.templateService.update(id, updateTemplateDto, userId);
  }

  /**
   * 删除模板
   * 需要登录认证，只允许用户删除自己的模板
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    const { userId } = req.user;
    return this.templateService.remove(id, userId);
  }
}
