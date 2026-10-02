import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LoginAttempt,
  LoginAttemptDocument,
} from './entities/login-attempt.entity';

/** 连续失败多少次后锁定（仅可信来源） */
export const LOGIN_MAX_FAILURES = 5;
/** 锁定时长：15 分钟 */
export const LOGIN_LOCK_MS = 15 * 60 * 1000;
/** 失败记录保留时长（TTL 自清） */
export const LOGIN_ATTEMPT_TTL_MS = 24 * 60 * 60 * 1000;
/** 单次失败最多额外延迟，避免把接口拖死 */
export const LOGIN_MAX_DELAY_MS = 2000;

/**
 * 判断来源 IP 是否可用于「按来源锁定」
 *
 * 回环地址说明请求要么来自本机、要么是 nginx 未配 TRUST_PROXY 时看到代理自己，
 * 此时所有用户共用一个来源，一旦允许锁定就会变成「一人锁死全体」。
 */
export function isTrustworthyClientIp(ip?: string | null): boolean {
  if (!ip) {
    return false;
  }
  const normalized = ip.trim().replace(/^::ffff:/i, '');
  if (!normalized) {
    return false;
  }
  return (
    normalized !== '127.0.0.1' &&
    normalized !== '::1' &&
    normalized !== 'localhost'
  );
}

/** 把来源 IP 归一成计数作用域 */
export function resolveLoginScope(ip?: string | null): string {
  return isTrustworthyClientIp(ip)
    ? `ip:${ip!.trim().replace(/^::ffff:/i, '')}`
    : 'shared';
}

/**
 * 失败后的额外延迟（指数式增长，封顶 LOGIN_MAX_DELAY_MS）
 *
 * 只作用在「失败响应」上：正确密码的登录永远不会被延迟，
 * 因此正常用户不受影响，而跨 IP 的慢速爆破会被明显拖慢。
 */
export function failureDelayMs(failures: number): number {
  if (failures <= 2) {
    return 0;
  }
  return Math.min((failures - 2) * 300, LOGIN_MAX_DELAY_MS);
}

export interface LoginLockStatus {
  locked: boolean;
  remainingMs: number;
}

export interface LoginFailureResult {
  failures: number;
  locked: boolean;
  delayMs: number;
}

/**
 * 登录失败计数服务（P0-5）
 *
 * 用数据库而不是内存保存计数：多实例部署下内存计数会各自为政，
 * 攻击者只要轮换实例就绕过了限速。
 */
@Injectable()
export class LoginAttemptService {
  private readonly logger = new Logger(LoginAttemptService.name);

  constructor(
    @InjectModel(LoginAttempt.name)
    private readonly attemptModel: Model<LoginAttemptDocument>,
  ) {}

  private buildKey(email: string, scope: string): string {
    return `${email.toLowerCase()}|${scope}`;
  }

  /** 该 (邮箱, 来源) 当前是否处于锁定状态 */
  async checkLocked(
    email: string,
    clientIp?: string,
  ): Promise<LoginLockStatus> {
    const scope = resolveLoginScope(clientIp);
    const record = await this.attemptModel
      .findOne({ key: this.buildKey(email, scope) })
      .exec();

    if (record?.lockedUntil && record.lockedUntil.getTime() > Date.now()) {
      return {
        locked: true,
        remainingMs: record.lockedUntil.getTime() - Date.now(),
      };
    }
    return { locked: false, remainingMs: 0 };
  }

  /** 记录一次失败，必要时写入锁定时间 */
  async recordFailure(
    email: string,
    clientIp?: string,
  ): Promise<LoginFailureResult> {
    const scope = resolveLoginScope(clientIp);
    const key = this.buildKey(email, scope);

    const inc: Record<string, unknown> = {
      $inc: { failures: 1 },
      $set: {
        email: email.toLowerCase(),
        scope,
        expiresAt: new Date(Date.now() + LOGIN_ATTEMPT_TTL_MS),
      },
      $setOnInsert: { key },
    };

    const updated = await this.attemptModel
      .findOneAndUpdate({ key }, inc, { new: true, upsert: true })
      .exec();

    const failures = updated?.failures ?? 1;
    const shouldLock = scope !== 'shared' && failures >= LOGIN_MAX_FAILURES;

    if (shouldLock) {
      const lockedUntil = new Date(Date.now() + LOGIN_LOCK_MS);
      await this.attemptModel
        .updateOne(
          { key },
          {
            $set: {
              lockedUntil,
              expiresAt: new Date(Date.now() + LOGIN_ATTEMPT_TTL_MS),
            },
          },
        )
        .exec();
      this.logger.warn(
        `登录失败次数达到上限，已锁定该来源 ${LOGIN_LOCK_MS / 60000} 分钟：${email} @ ${scope}`,
      );
      return { failures, locked: true, delayMs: failureDelayMs(failures) };
    }

    return {
      failures,
      locked: false,
      delayMs: failureDelayMs(failures),
    };
  }

  /** 登录成功后清空该邮箱在所有来源下的失败记录 */
  async clear(email: string): Promise<void> {
    await this.attemptModel.deleteMany({ email: email.toLowerCase() }).exec();
  }
}
