import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
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

@Injectable()
export class UserService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existingUser = await this.userModel.findOne({
      $or: [
        { email: createUserDto.email },
        { username: createUserDto.username },
      ],
    });

    if (existingUser) {
      throw new ConflictException('Username or email already exists');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const createdUser = await this.userModel.create({
      ...createUserDto,
      password: hashedPassword,
    });
    Reflect.deleteProperty(createdUser, 'password');
    return createdUser;
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    const user = await this.userModel.findOne({ email }).exec();
    if (!user) {
      throw new BadRequestException('用户不存在或密码错误');
    }
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      throw new BadRequestException('用户不存在或密码错误');
    }
    const token = await this.jwtService.sign({
      userId: user._id,
      username: user.username,
      email: user.email,
    });

    // Convert to plain object and remove password before returning
    const userObject = user.toObject();
    Reflect.deleteProperty(userObject, 'password');

    return {
      token,
      user: userObject,
    };
  }

  async findAll(): Promise<User[]> {
    return this.userModel.find().select('-password').exec();
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userModel.findById(id).select('-password').exec();
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async findByUsername(username: string): Promise<UserDocument | undefined> {
    const user = await this.userModel.findOne({ username }).exec();
    return user || undefined;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updateUserDto, { new: true })
      .exec();

    if (!updatedUser) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return updatedUser;
  }

  async remove(id: string): Promise<User> {
    const deletedUser = await this.userModel.findByIdAndDelete(id).exec();
    if (!deletedUser) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return deletedUser;
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
    // 不允许在该接口修改密码，需走修改密码专用接口
    if (updateUserDto.password) {
      throw new BadRequestException('请使用修改密码接口');
    }

    // 唯一性检查 - 邮箱
    if (updateUserDto.email) {
      const exists = await this.userModel
        .findOne({ email: updateUserDto.email })
        .exec();
      if (exists && exists._id.toString() !== userId) {
        throw new ConflictException('邮箱已被占用');
      }
    }
    // 唯一性检查 - 用户名
    if (updateUserDto.username) {
      const exists = await this.userModel
        .findOne({ username: updateUserDto.username })
        .exec();
      if (exists && exists._id.toString() !== userId) {
        throw new ConflictException('用户名已被占用');
      }
    }

    const updated = await this.userModel
      .findByIdAndUpdate(userId, updateUserDto, { new: true })
      .select('-password')
      .exec();
    if (!updated) {
      throw new NotFoundException('用户不存在');
    }
    return updated;
  }

  /**
   * 修改密码（需校验旧密码）
   * @param userId 当前登录用户 ID
   * @param dto 包含旧密码与新密码
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const match = await bcrypt.compare(dto.oldPassword, user.password);
    if (!match) {
      throw new BadRequestException('旧密码不正确');
    }

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.userModel.findByIdAndUpdate(userId, { password: hashed }).exec();

    return { message: '密码修改成功' };
  }
}
