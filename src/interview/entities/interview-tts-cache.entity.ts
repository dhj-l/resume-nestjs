import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';

/** TTS 语音缓存保留时长（TTL） */
const CACHE_TTL_DAYS = 30;

/**
 * 面试官问题语音缓存
 *
 * 同一会话同一轮次的问题文本固定，合成结果按 (sessionId, round) 落库，
 * 重复点播直接读库，避免每次都调用 MiMo TTS 消耗费用。
 * 缓存规范格式为原始 PCM16 + 采样率（mimeType='audio/pcm'），流式接口可逐块
 * 重放，旧接口按需封装为 wav 返回；历史 wav 缓存（无 sampleRate）视为失效。
 * 独立集合而非挂在会话 messages 上：单题音频约 1~5MB，8 轮会撑爆
 * 16MB 的文档上限，且会拖慢会话文档的高频读写。
 */
@Schema({ collection: 'interview_tts_cache' })
export class InterviewTtsCache {
  /**
   * 所属面试会话 ID
   */
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  sessionId: Types.ObjectId;

  /**
   * 问题轮次（从 1 开始）
   */
  @Prop({ required: true })
  round: number;

  /**
   * 合成时的问题文本（排查用，非必需）
   */
  @Prop()
  text?: string;

  /**
   * 音频字节。
   * 规范格式：`audio/pcm`（PCM16 小端原始字节，不含文件头）；
   * 历史数据：`audio/wav`（完整 WAV 文件），命中时视作失效并重新合成覆盖。
   */
  @Prop({ type: Buffer, required: true })
  audio: Buffer;

  /**
   * 音频 MIME 类型
   */
  @Prop({ default: 'audio/pcm' })
  mimeType: string;

  /**
   * PCM16 采样率（Hz），mimeType 为 audio/pcm 时必有；
   * 历史 wav 缓存无此字段，用作旧数据失效判定
   */
  @Prop()
  sampleRate?: number;

  /**
   * 合成时间（TTL 过期基准）
   */
  @Prop({ default: Date.now })
  createdAt: Date;
}

export const InterviewTtsCacheSchema =
  SchemaFactory.createForClass(InterviewTtsCache);

/**
 * 同会话同轮次仅保留一条缓存；upsert 冲突时覆盖
 */
InterviewTtsCacheSchema.index({ sessionId: 1, round: 1 }, { unique: true });

/**
 * 过期自动回收（会话文档永不物理删除，缓存生命周期由 TTL 管理）
 */
InterviewTtsCacheSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: CACHE_TTL_DAYS * 24 * 60 * 60 },
);
