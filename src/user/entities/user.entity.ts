import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

/**
 * OAuth 第三方平台认证信息（内嵌子文档）
 * 一个用户可以绑定多个第三方平台，以数组形式存储在 User 文档中
 */
@Schema({ _id: false, timestamps: false })
export class OAuthProvider {
  /**
   * 第三方平台类型标识
   * 'gitee' — 码云 Gitee
   * 'github' — GitHub
   */
  @Prop({
    required: true,
    enum: ['gitee', 'github'],
    comment: '第三方平台类型：gitee / github',
  })
  platform: string;

  /**
   * 用户在第三方平台的唯一标识 ID（如 GitHub 的 nodeId 或 Gitee 的 id）
   */
  @Prop({
    required: true,
    index: true,
    comment: '第三方平台上的用户唯一标识ID',
  })
  platformUserId: string;

  /**
   * OAuth 访问令牌（access_token）
   * 用于调用第三方平台 API（如获取用户信息、仓库列表等）
   */
  @Prop({
    required: true,
    comment: 'OAuth 访问令牌（access_token）',
  })
  accessToken: string;

  /**
   * OAuth 刷新令牌（refresh_token）
   * 部分平台（如 GitHub）不提供 refresh_token，该字段可能为空
   */
  @Prop({
    comment:
      'OAuth 刷新令牌（refresh_token），用于续期访问令牌，部分平台可能为空',
  })
  refreshToken?: string;

  /**
   * 访问令牌过期时间
   * 超过该时间后需使用 refresh_token 续期或引导用户重新授权
   */
  @Prop({
    comment: '访问令牌过期时间，过期后需刷新或重新授权',
  })
  tokenExpiresAt?: Date;

  /**
   * 用户在第三方平台的昵称/显示名称
   */
  @Prop({
    maxlength: 100,
    comment: '第三方平台用户昵称',
  })
  nickname?: string;

  /**
   * 用户在第三方平台的头像 URL
   */
  @Prop({
    maxlength: 500,
    comment: '第三方平台用户头像URL',
  })
  avatarUrl?: string;

  /**
   * 用户在第三方平台的个人主页 URL
   */
  @Prop({
    maxlength: 500,
    comment: '第三方平台用户个人主页URL',
  })
  profileUrl?: string;

  /**
   * 第三方平台绑定的邮箱地址
   * 注意：部分平台（如 GitHub）支持隐私邮箱，该字段可能为空或为平台生成的代理邮箱
   */
  @Prop({
    maxlength: 100,
    comment: '第三方平台绑定的邮箱（可能为空或为代理邮箱）',
  })
  email?: string;
}

export const OAuthProviderSchema = SchemaFactory.createForClass(OAuthProvider);

@Schema({
  // 自动添加 createdAt 和 updatedAt 字段
  timestamps: true,
})
export class User {
  @Prop({ required: true, unique: true, index: true })
  username: string;

  /**
   * 加密后的登录密码
   * 通过 OAuth 注册的用户可能不设置密码，因此该字段改为可选
   */
  @Prop({ required: false, comment: '加密后的密码，OAuth注册用户可能为空' })
  password?: string;

  @Prop({ required: true, unique: true, index: true })
  email: string;

  // 登录失败次数
  @Prop({ default: 0, index: true })
  loginAttempts: number;

  // 账户锁定时间
  @Prop({ index: true })
  lockedUntil?: Date;

  /**
   * OAuth 第三方平台绑定列表
   * 数组中的每个元素对应一个已绑定的第三方平台
   * 同一平台（如 GitHub）只能绑定一次，由业务层保证唯一性
   */
  @Prop({
    type: [OAuthProviderSchema],
    default: [],
    comment: 'OAuth第三方平台绑定信息列表，支持同时绑定多个平台',
  })
  oauthProviders: OAuthProvider[];

  /**
   * 账户创建来源标识
   * 'email'  — 传统邮箱+密码注册
   * 'gitee'  — 通过 Gitee OAuth 注册
   * 'github' — 通过 GitHub OAuth 注册
   */
  @Prop({
    default: 'email',
    enum: ['email', 'gitee', 'github'],
    comment: '账户创建来源：email / gitee / github',
  })
  createdVia: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
