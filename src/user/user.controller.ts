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
  ForbiddenException,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LoginDto } from './dto/login-dto';
import type { Request } from 'express';
import { ChangePasswordDto } from './dto/change-password.dto';

// 为请求对象增加用户类型,避免 any 引发的类型风险
type RequestWithUser = Request & {
  user: { userId: string; username: string; email: string; role?: string };
};

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * 创建新用户
   * @param createUserDto 用户创建 DTO
   * @returns 创建的用户对象
   */
  @Post()
  async create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  /**
   * 用户登录
   * @param loginDto 登录 DTO
   * @returns 包含 JWT token 和用户信息的对象
   */
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.userService.login(loginDto);
  }

  /**
   * 获取所有用户列表(仅管理员)
   * @param req 请求对象,包含用户信息
   * @returns 用户数组
   */
  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@Req() req: RequestWithUser) {
    // 只允许管理员查看所有用户列表
    // const isAdmin = req.user.role === 'admin';
    // if (!isAdmin) {
    //   throw new ForbiddenException('没有权限查看所有用户');
    // }
    return this.userService.findAll();
  }

  /**
   * 修改密码(需要 JWT 认证)
   * @param req 请求对象,包含用户信息
   * @param dto 修改密码 DTO,包含旧密码和新密码
   * @returns 操作结果消息
   */
  @UseGuards(JwtAuthGuard)
  @Patch('change-password')
  async changePassword(
    @Req() req: RequestWithUser,
    @Body() dto: ChangePasswordDto,
  ) {
    const { userId } = req.user;
    return this.userService.changePassword(userId, dto);
  }

  /**
   * 更新指定用户信息(仅管理员或用户自己)
   * @param id 用户 ID
   * @param updateUserDto 更新 DTO
   * @param req 请求对象,包含用户信息
   * @returns 更新后的用户对象
   */
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: RequestWithUser,
  ) {
    const { userId } = req.user;
    // 检查是否为管理员或修改自己的信息
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && userId !== id) {
      throw new ForbiddenException('没有权限修改该用户信息');
    }
    return this.userService.update(id, updateUserDto);
  }

  /**
   * 删除指定用户(仅管理员或用户自己)
   * @param id 用户 ID
   * @param req 请求对象,包含用户信息
   * @returns 被删除的用户对象
   */
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    const { userId } = req.user;
    // 检查是否为管理员或删除自己的账户
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && userId !== id) {
      throw new ForbiddenException('没有权限删除该用户');
    }
    return this.userService.remove(id);
  }

  /**
   * 获取当前登录用户的详细信息
   * @param req 请求对象,包含用户信息
   * @returns 当前用户对象
   */
  // 获取当前用户信息
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Req() req: RequestWithUser) {
    const { userId } = req.user;
    return this.userService.findOne(userId);
  }

  /**
   * 更新当前登录用户的信息(不允许修改密码)
   * @param req 请求对象,包含用户信息
   * @param updateUserDto 更新 DTO
   * @returns 更新后的用户对象
   */
  // 更新当前用户信息（不允许在此修改密码）
  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  async updateProfile(
    @Req() req: RequestWithUser,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const { userId } = req.user;
    return this.userService.updateProfile(userId, updateUserDto);
  }

  /**
   * 获取指定用户的详细信息(仅管理员或用户自己)
   * @param id 用户 ID
   * @param req 请求对象,包含用户信息
   * @returns 用户对象
   */
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    const { userId } = req.user;
    // 检查是否为管理员或查看自己的信息
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && userId !== id) {
      throw new ForbiddenException('没有权限查看该用户信息');
    }
    return this.userService.findOne(id);
  }
}
