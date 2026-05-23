import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserDocument } from './entities/user.entity';
import { LoginDto } from './dto/login-dto';
import { JwtService } from '@nestjs/jwt';
import { ChangePasswordDto } from './dto/change-password.dto';
import { TokenBlacklistService } from '../auth/token-blacklist.service';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private tokenBlacklistService: TokenBlacklistService,
  ) {}

  /**
   * 创建新用户
   * @param createUserDto 用户创建 DTO,包含用户名、密码和邮箱
   * @returns 创建的用户对象(不包含密码)
   * @throws ConflictException 当用户名或邮箱已存在时抛出
   */
  async create(createUserDto: CreateUserDto): Promise<User> {
    try {
      this.logger.log(`尝试创建用户: ${createUserDto.email}`);

      const existingUser = await this.userModel.findOne({
        $or: [
          { email: createUserDto.email },
          { username: createUserDto.username },
        ],
      });

      if (existingUser) {
        this.logger.warn(
          `用户已存在: ${createUserDto.email} 或 ${createUserDto.username}`,
        );
        throw new ConflictException('Username or email already exists');
      }

      const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
      const createdUser = await this.userModel.create({
        ...createUserDto,
        password: hashedPassword,
      });
      Reflect.deleteProperty(createdUser, 'password');

      this.logger.log(`用户创建成功: ${createdUser.email}`);
      return createdUser;
    } catch (error) {
      this.logger.error(
        `创建用户失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * 用户登录
   * @param loginDto 登录 DTO,包含邮箱和密码
   * @returns 包含 JWT token 和用户信息的对象
   * @throws BadRequestException 当用户不存在、密码错误或账户被锁定时抛出
   */
  async login(loginDto: LoginDto) {
    try {
      this.logger.log(`用户尝试登录: ${loginDto.email}`);

      const { email, password } = loginDto;
      const user = await this.userModel.findOne({ email }).exec();
      if (!user) {
        this.logger.warn(`登录失败: 用户不存在 - ${email}`);
        throw new BadRequestException('用户不存在或密码错误');
      }

      // 检查账户是否被锁定
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const remainingTime = Math.ceil(
          (user.lockedUntil.getTime() - Date.now()) / 1000 / 60,
        );
        this.logger.warn(
          `登录失败: 账户已锁定 - ${email}, 剩余 ${remainingTime} 分钟`,
        );
        throw new BadRequestException(
          `账户已被锁定,请 ${remainingTime} 分钟后再试`,
        );
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        // 增加登录失败次数
        user.loginAttempts = (user.loginAttempts || 0) + 1;

        // 如果失败次数达到5次,锁定账户30分钟
        if (user.loginAttempts >= 5) {
          user.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30分钟
          await user.save();
          this.logger.warn(
            `登录失败: 账户被锁定 - ${email}, 失败次数: ${user.loginAttempts}`,
          );
          throw new BadRequestException('登录失败次数过多,账户已被锁定30分钟');
        }

        await user.save();
        this.logger.warn(
          `登录失败: 密码错误 - ${email}, 失败次数: ${user.loginAttempts}`,
        );
        throw new BadRequestException(
          `用户不存在或密码错误,剩余尝试次数: ${5 - user.loginAttempts}`,
        );
      }

      // 登录成功,重置失败次数和锁定时间
      if (user.loginAttempts > 0 || user.lockedUntil) {
        user.loginAttempts = 0;
        user.lockedUntil = undefined;
        await user.save();
      }

      const token = this.jwtService.sign({
        userId: user._id,
        username: user.username,
        email: user.email,
      });

      // Convert to plain object and remove password before returning
      const userObject = user.toObject();
      Reflect.deleteProperty(userObject, 'password');

      this.logger.log(`用户登录成功: ${email}`);
      return {
        token,
        user: userObject,
      };
    } catch (error) {
      this.logger.error(
        `登录失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  async logout(token: string) {
    try {
      this.logger.log('用户请求退出登录');
      await this.tokenBlacklistService.addToBlacklist(token);
      this.logger.log('用户退出登录成功');
      return { message: '退出登录成功' };
    } catch (error) {
      this.logger.error(
        `退出登录失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * 获取所有用户列表
   * @returns 用户数组(不包含密码)
   */
  async findAll(): Promise<User[]> {
    return this.userModel.find().select('-password').exec();
  }

  /**
   * 根据 ID 查找用户
   * @param id 用户 ID
   * @returns 用户对象(不包含密码)
   * @throws NotFoundException 当用户不存在时抛出
   */
  async findOne(id: string): Promise<User> {
    const user = await this.userModel.findById(id).select('-password').exec();
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  /**
   * 根据用户名查找用户
   * @param username 用户名
   * @returns 用户文档或 undefined
   */
  async findByUsername(username: string): Promise<UserDocument | undefined> {
    const user = await this.userModel.findOne({ username }).exec();
    return user || undefined;
  }

  /**
   * 更新用户信息
   * @param id 用户 ID
   * @param updateUserDto 更新 DTO(不允许包含密码)
   * @returns 更新后的用户对象(不包含密码)
   * @throws BadRequestException 当尝试修改密码时抛出
   * @throws NotFoundException 当用户不存在时抛出
   */
  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    try {
      this.logger.log(`尝试更新用户: ${id}`);

      // 不允许直接修改密码,必须使用 changePassword 方法
      if (updateUserDto.password) {
        this.logger.warn(`尝试通过 update 方法修改密码: ${id}`);
        throw new BadRequestException('请使用修改密码接口');
      }

      const updatedUser = await this.userModel
        .findByIdAndUpdate(id, updateUserDto, { new: true })
        .select('-password')
        .exec();

      if (!updatedUser) {
        this.logger.warn(`更新用户失败: 用户不存在 - ${id}`);
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      this.logger.log(`用户更新成功: ${id}`);
      return updatedUser;
    } catch (error) {
      this.logger.error(
        `更新用户失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * 删除用户
   * @param id 用户 ID
   * @returns 被删除的用户对象
   * @throws NotFoundException 当用户不存在时抛出
   */
  async remove(id: string): Promise<User> {
    try {
      this.logger.log(`尝试删除用户: ${id}`);

      const deletedUser = await this.userModel.findByIdAndDelete(id).exec();
      if (!deletedUser) {
        this.logger.warn(`删除用户失败: 用户不存在 - ${id}`);
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      this.logger.log(`用户删除成功: ${id}`);
      return deletedUser;
    } catch (error) {
      this.logger.error(
        `删除用户失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * 获取当前用户信息
   * @param userId 当前登录用户 ID
   */
  async getProfile(userId: string): Promise<User> {
    return this.findOne(userId);
  }

  /**
   * 更新当前用户信息（不允许直接修改密码）
   * @param userId 当前登录用户 ID
   * @param updateUserDto 更新字段（可包含 username/email）
   */
  async updateProfile(
    userId: string,
    updateUserDto: UpdateUserDto,
  ): Promise<User> {
    try {
      this.logger.log(`尝试更新用户资料: ${userId}`);

      // 不允许在该接口修改密码,需走修改密码专用接口
      if (updateUserDto.password) {
        this.logger.warn(`尝试通过 updateProfile 方法修改密码: ${userId}`);
        throw new BadRequestException('请使用修改密码接口');
      }

      // 唯一性检查 - 邮箱
      if (updateUserDto.email) {
        const exists = await this.userModel
          .findOne({ email: updateUserDto.email })
          .exec();
        if (exists && exists._id.toString() !== userId) {
          this.logger.warn(
            `更新用户资料失败: 邮箱已被占用 - ${updateUserDto.email}`,
          );
          throw new ConflictException('邮箱已被占用');
        }
      }
      // 唯一性检查 - 用户名
      if (updateUserDto.username) {
        const exists = await this.userModel
          .findOne({ username: updateUserDto.username })
          .exec();
        if (exists && exists._id.toString() !== userId) {
          this.logger.warn(
            `更新用户资料失败: 用户名已被占用 - ${updateUserDto.username}`,
          );
          throw new ConflictException('用户名已被占用');
        }
      }

      const updated = await this.userModel
        .findByIdAndUpdate(userId, updateUserDto, { new: true })
        .select('-password')
        .exec();
      if (!updated) {
        this.logger.warn(`更新用户资料失败: 用户不存在 - ${userId}`);
        throw new NotFoundException('用户不存在');
      }

      this.logger.log(`用户资料更新成功: ${userId}`);
      return updated;
    } catch (error) {
      this.logger.error(
        `更新用户资料失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * 修改密码（需校验旧密码）
   * @param userId 当前登录用户 ID
   * @param dto 包含旧密码与新密码
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    try {
      this.logger.log(`尝试修改密码: ${userId}`);

      const user = await this.userModel.findById(userId).exec();
      if (!user) {
        this.logger.warn(`修改密码失败: 用户不存在 - ${userId}`);
        throw new NotFoundException('用户不存在');
      }

      const match = await bcrypt.compare(dto.oldPassword, user.password);
      if (!match) {
        this.logger.warn(`修改密码失败: 旧密码不正确 - ${userId}`);
        throw new BadRequestException('旧密码不正确');
      }

      const hashed = await bcrypt.hash(dto.newPassword, 10);
      await this.userModel
        .findByIdAndUpdate(userId, { password: hashed })
        .exec();

      this.logger.log(`密码修改成功: ${userId}`);
      return { message: '密码修改成功' };
    } catch (error) {
      this.logger.error(
        `修改密码失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }
}
