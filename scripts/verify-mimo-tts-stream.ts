/**
 * MiMo TTS 流式契约验证脚本
 *
 * 用途：端到端流式改造前，用真实 MIMO_API_KEY 实测并确认契约点：
 *   1. `stream: true` 时每帧 JSON 中音频数据的字段路径（delta/message/…）
 *   2. pcm16 输出的采样率（与非流式 wav 文件头交叉核对）
 *   3. 流的终帧形态（finish_reason / usage / [DONE] / error）
 *   4. 流式 + format=wav 是否受支持及其分块形态（官方示例用 wav，供对比）
 *
 * 使用：
 *   pnpm verify:mimo-tts
 * 或：
 *   npx ts-node --project tsconfig.scripts.json scripts/verify-mimo-tts-stream.ts
 *
 * 环境变量（读取项目根 .env）：
 *   MIMO_API_KEY（必填）、MIMO_TTS_MODEL、MIMO_TTS_VOICE、MIMO_BASE_URL
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL = process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1';
const MODEL = process.env.MIMO_TTS_MODEL || 'mimo-v2.5-tts';
const VOICE = process.env.MIMO_TTS_VOICE || '冰糖';
const TEXT = '请介绍一下事件循环。';
const STYLE = '请用专业、沉稳、清晰的面试官语气朗读，语速适中，自然连贯。';

/** 读取 MIMO_API_KEY，缺失时直接退出 */
function requireApiKey(): string {
  const key = process.env.MIMO_API_KEY;
  if (!key) {
    console.error('❌ 缺少 MIMO_API_KEY，请先配置 .env');
    process.exit(1);
  }
  return key;
}
const API_KEY: string = requireApiKey();

/** 发送一次 OpenAI 兼容请求，返回 fetch Response */
async function request(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      // 与 openai SDK 行为一致；官方 curl 示例使用 api-key 头，两者皆可
      Authorization: `Bearer ${API_KEY}`,
      'api-key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

/** 解析 WAV 文件头（容错 fmt 扩展块） */
function parseWavHeader(buf: Buffer) {
  if (buf.subarray(0, 4).toString('ascii') !== 'RIFF') {
    throw new Error('不是 RIFF/WAV 文件');
  }
  let fmt: { sampleRate?: number; channels?: number; bits?: number } | null =
    null;
  let dataSize = -1;
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.subarray(off, off + 4).toString('ascii');
    const size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      fmt = {
        audioFormat: buf.readUInt16LE(off + 8),
        channels: buf.readUInt16LE(off + 10),
        sampleRate: buf.readUInt32LE(off + 12),
        bits: buf.readUInt16LE(off + 22),
      } as any;
    } else if (id === 'data') {
      dataSize = size;
      break;
    }
    off += 8 + size + (size % 2);
  }
  return { fmt: fmt as any, dataSize };
}

function describeFrame(frame: unknown): string {
  const f = frame as any;
  const choice = f?.choices?.[0] ?? {};
  return JSON.stringify({
    frameKeys: Object.keys(f ?? {}),
    deltaKeys: Object.keys(choice?.delta ?? {}),
    messageKeys: Object.keys(choice?.message ?? {}),
    deltaAudioKeys: Object.keys(choice?.delta?.audio ?? {}),
    messageAudioKeys: Object.keys(choice?.message?.audio ?? {}),
    finishReason: choice?.finish_reason ?? null,
    hasFrameError: !!f?.error,
    hasUsage: !!f?.usage,
    audioChars: (
      choice?.delta?.audio?.data ??
      choice?.message?.audio?.data ??
      ''
    ).length,
  });
}

/** 找出帧内音频 base64 字段的路径与值（单点归一化） */
function extractAudioValue(frame: any): { path: string; value: string } | null {
  const candidates: Array<[string, unknown]> = [
    ['choices[0].delta.audio.data', frame?.choices?.[0]?.delta?.audio?.data],
    ['choices[0].message.audio.data', frame?.choices?.[0]?.message?.audio?.data],
    ['delta.audio.data', frame?.delta?.audio?.data],
    ['message.audio.data', frame?.message?.audio?.data],
    ['audio.data', frame?.audio?.data],
  ];
  for (const [path, value] of candidates) {
    if (typeof value === 'string' && value.length > 0) {
      return { path, value };
    }
  }
  return null;
}

interface StreamProbeStats {
  ok: boolean;
  httpStatus?: number;
  httpBody?: string;
  frameCount: number;
  audioFieldPath: string | null;
  totalAudioBytes: number;
  /** 以 RIFF 魔数开头的音频块数（= 完整 WAV 分块） */
  riffChunks: number;
  /** 非 RIFF 的音频块数（= 裸 PCM 分块） */
  rawChunks: number;
  /** WAV 分块内嵌头部解析出的采样率（若有） */
  chunkSampleRates: number[];
  terminal: string;
  frameSamples: string[];
}

/** 对流式响应做一次完整解析，返回统计 */
async function probeStream(format: 'pcm16' | 'wav'): Promise<StreamProbeStats> {
  const res = await request({
    model: MODEL,
    messages: [
      { role: 'user', content: STYLE },
      { role: 'assistant', content: TEXT },
    ],
    audio: { format, voice: VOICE },
    stream: true,
  });

  const stats: StreamProbeStats = {
    ok: res.ok,
    httpStatus: res.status,
    frameCount: 0,
    audioFieldPath: null,
    totalAudioBytes: 0,
    riffChunks: 0,
    rawChunks: 0,
    chunkSampleRates: [],
    terminal: '（流结束但无终帧标记）',
    frameSamples: [],
  };

  if (!res.ok) {
    stats.httpBody = await res.text();
    return stats;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let sentinel = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') {
        stats.terminal = '[DONE]';
        sentinel = true;
        break;
      }
      let frame: any;
      try {
        frame = JSON.parse(payload);
      } catch {
        continue;
      }
      const audio = extractAudioValue(frame);
      if (audio) {
        if (!stats.audioFieldPath) stats.audioFieldPath = audio.path;
        const bytes = Buffer.from(audio.value, 'base64');
        stats.totalAudioBytes += bytes.length;
        if (
          bytes.length >= 4 &&
          bytes.subarray(0, 4).toString('ascii') === 'RIFF'
        ) {
          stats.riffChunks += 1;
          try {
            const { fmt } = parseWavHeader(bytes);
            if (fmt?.sampleRate && !stats.chunkSampleRates.includes(fmt.sampleRate)) {
              stats.chunkSampleRates.push(fmt.sampleRate);
            }
          } catch {
            // 头部不完整的分块忽略
          }
        } else {
          stats.rawChunks += 1;
        }
      }
      if (frame?.error) {
        stats.terminal = JSON.stringify(frame.error);
        sentinel = true;
        break;
      }
      if (
        stats.frameCount < 2 ||
        audio ||
        frame?.choices?.[0]?.finish_reason
      ) {
        if (stats.frameSamples.length < 4) {
          stats.frameSamples.push(describeFrame(frame));
        }
      }
      stats.frameCount += 1;
    }
    if (sentinel) break;
  }
  return stats;
}

async function main() {
  console.log(`▶ 契约点 1/4：流式帧结构（model=${MODEL}, voice=${VOICE}）\n`);

  const pcm = await probeStream('pcm16');
  if (!pcm.ok) {
    console.error(`❌ 流式请求失败：HTTP ${pcm.httpStatus}`);
    console.error(pcm.httpBody);
    process.exit(1);
  }
  console.log(`共解析 ${pcm.frameCount} 帧`);
  console.log(`音频字段路径：${pcm.audioFieldPath ?? '⚠️ 未识别到任何音频字段'}`);
  console.log(`pcm16 总字节数：${pcm.totalAudioBytes}`);
  console.log('帧样例（前 2 帧 + 含音频/终帧）：');
  for (const sample of pcm.frameSamples) console.log('  ', sample);
  console.log('终帧：', pcm.terminal);

  if (!pcm.audioFieldPath) {
    console.error(
      '\n❌ 流中未识别到音频数据：请将上方帧样例反馈给开发者，调整 TtsService.extractAudioPayload 的字段路径。',
    );
    process.exit(1);
  }

  console.log('\n▶ 契约点 2/4：pcm16 采样率交叉核对（非流式 wav 文件头）\n');

  const wavRes = await request({
    model: MODEL,
    messages: [
      { role: 'user', content: STYLE },
      { role: 'assistant', content: TEXT },
    ],
    audio: { format: 'wav', voice: VOICE },
    stream: false,
  });
  if (!wavRes.ok) {
    console.error(`❌ 非流式请求失败：HTTP ${wavRes.status}`);
    console.error(await wavRes.text());
    process.exit(1);
  }
  const wavJson: any = await wavRes.json();
  const wavBase64 = wavJson?.choices?.[0]?.message?.audio?.data;
  if (!wavBase64) {
    console.error('❌ 非流式响应缺少 audio.data');
    process.exit(1);
  }
  const wavBuf = Buffer.from(wavBase64, 'base64');
  const { fmt, dataSize } = parseWavHeader(wavBuf);
  console.log(`非流式 wav：${wavBuf.length} 字节`);
  console.log(
    `wav 头：sampleRate=${fmt?.sampleRate}Hz channels=${fmt?.channels} bits=${fmt?.bits} data=${dataSize}`,
  );
  console.log(
    `交叉核对：流式 pcm16 ${pcm.totalAudioBytes} 字节 ${
      pcm.totalAudioBytes === dataSize
        ? '✅ 一致'
        : '⚠️ 不一致（两次独立合成调用，时长存在正常波动）'
    }`,
  );

  console.log('\n▶ 契约点 3/4：流式 wav 形态探测（官方示例格式，对比用）\n');

  const wavStream = await probeStream('wav');
  if (!wavStream.ok) {
    console.log(
      `ℹ️ 流式 + format=wav 不被支持（HTTP ${wavStream.httpStatus}）：${wavStream.httpBody?.slice(0, 300) ?? ''}`,
    );
    console.log('结论：维持流式使用 pcm16（已验证可用），这是预期行为。');
  } else {
    console.log(
      `流式 + format=wav 可用：共 ${wavStream.frameCount} 帧，音频字段="${wavStream.audioFieldPath}"`,
    );
    console.log(
      `完整 WAV 分块（RIFF 开头）：${wavStream.riffChunks} 个；裸数据分块：${wavStream.rawChunks} 个`,
    );
    console.log(`总字节数：${wavStream.totalAudioBytes}`);
    if (wavStream.chunkSampleRates.length > 0) {
      console.log(`分块内采样率：${wavStream.chunkSampleRates.join(', ')}Hz`);
    }
    console.log('帧样例：');
    for (const sample of wavStream.frameSamples) console.log('  ', sample);
    console.log('终帧：', wavStream.terminal);
    console.log(
      '💡 若分块均为完整 WAV（RIFF 开头）：前端可用 decodeAudioData 逐块解码播放，后端可直接透传 wav 分块；如需切换请告知。',
    );
  }

  console.log('\n▶ 结论\n');
  console.log(
    `音频字段="${pcm.audioFieldPath}"，采样率=${fmt?.sampleRate ?? '未知'}Hz（声道 ${fmt?.channels ?? '未知'}）。`,
  );
  console.log(
    '若采样率与 TtsService 默认值 24000 不符：设置环境变量 MIMO_TTS_SAMPLE_RATE 即可，无需改代码。',
  );
}

main().catch((error) => {
  console.error('❌ 验证失败：', error);
  process.exit(1);
});
