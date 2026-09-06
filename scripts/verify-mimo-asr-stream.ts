/**
 * MiMo ASR 流式契约验证脚本
 *
 * 用途：实现 SttService 前，用真实 MIMO_API_KEY 实测并确认契约点：
 *   1. `stream: true` 时识别文本的字段路径（delta.content / message.content / …）
 *      官方文档未给响应样例，以实测为准
 *   2. asr_options 透传：Node openai SDK 不认识该字段，确认直接放入 body 是否被上游接受
 *   3. 转写正确性：用同账号 TTS 合成一句已知文本 → wav → ASR 转写回读对照
 *
 * 使用：
 *   pnpm verify:mimo-asr
 * 或：
 *   npx ts-node --project tsconfig.scripts.json scripts/verify-mimo-asr-stream.ts
 *
 * 环境变量（读取项目根 .env）：
 *   MIMO_API_KEY（必填）、MIMO_ASR_MODEL、MIMO_BASE_URL
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const BASE_URL = process.env.MIMO_BASE_URL || 'https://api.xiaomimimo.com/v1';
const TTS_MODEL = process.env.MIMO_TTS_MODEL || 'mimo-v2.5-tts';
const ASR_MODEL = process.env.MIMO_ASR_MODEL || 'mimo-v2.5-asr';
/** 待转写句子：TTS 合成后交给 ASR 回读，用于正确性对照 */
const TEXT = '今天天气不错，我们一起去公园散步吧。';

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

/** 契约点 3 前置：用 TTS 合成已知句子，落盘 wav 并返回字节 */
async function synthesizeFixtureWav(): Promise<Buffer> {
  console.log(`▶ 前置：TTS 合成对照句子（model=${TTS_MODEL}）\n`);
  const res = await request({
    model: TTS_MODEL,
    messages: [{ role: 'assistant', content: TEXT }],
    audio: { format: 'wav', voice: process.env.MIMO_TTS_VOICE || '冰糖' },
    stream: false,
  });
  if (!res.ok) {
    console.error(`❌ TTS 合成失败：HTTP ${res.status}`);
    console.error(await res.text());
    process.exit(1);
  }
  const json: any = await res.json();
  const base64 = json?.choices?.[0]?.message?.audio?.data;
  if (!base64) {
    console.error('❌ TTS 响应缺少 audio.data');
    process.exit(1);
  }
  const wav = Buffer.from(base64, 'base64');
  const file = path.join(os.tmpdir(), 'mimo-asr-verify.wav');
  fs.writeFileSync(file, wav);
  console.log(`合成文本：「${TEXT}」`);
  console.log(`wav 大小：${wav.length} 字节，已写入 ${file}\n`);
  return wav;
}

/** 在帧内找出文本增量的字段路径与值（单点归一化候选列表） */
function extractTextValue(frame: any): { path: string; value: string } | null {
  const choice = frame?.choices?.[0];
  const candidates: Array<[string, unknown]> = [
    ['choices[0].delta.content', choice?.delta?.content],
    ['choices[0].message.content', choice?.message?.content],
    ['choices[0].delta.text', choice?.delta?.text],
    ['choices[0].message.text', choice?.message?.text],
    ['delta.content', frame?.delta?.content],
    ['message.content', frame?.message?.content],
    ['text', frame?.text],
  ];
  for (const [path, value] of candidates) {
    if (typeof value === 'string' && value.length > 0) {
      return { path, value };
    }
  }
  return null;
}

function describeFrame(frame: unknown): string {
  const f = frame as any;
  const choice = f?.choices?.[0] ?? {};
  return JSON.stringify({
    frameKeys: Object.keys(f ?? {}),
    deltaKeys: Object.keys(choice?.delta ?? {}),
    messageKeys: Object.keys(choice?.message ?? {}),
    finishReason: choice?.finish_reason ?? null,
    hasFrameError: !!f?.error,
    hasUsage: !!f?.usage,
  });
}

interface AsrStreamStats {
  ok: boolean;
  httpStatus?: number;
  httpBody?: string;
  frameCount: number;
  textFieldPath: string | null;
  /** 流中累计到的完整识别文本 */
  text: string;
  terminal: string;
  frameSamples: string[];
}

/** 解析一次 ASR 流式响应，返回统计 */
async function probeAsrStream(
  wav: Buffer,
  label: string,
  withAsrOptions: boolean,
): Promise<AsrStreamStats> {
  console.log(`▶ ${label}\n`);
  const audioBase64 = `data:audio/wav;base64,${wav.toString('base64')}`;
  const body: Record<string, unknown> = {
    model: ASR_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'input_audio',
            input_audio: { data: audioBase64 },
          },
        ],
      },
    ],
    stream: true,
  };
  if (withAsrOptions) {
    // 模拟 Node openai SDK 的行为：未知字段直接随 body 透传
    body.asr_options = { language: 'auto' };
  }

  const stats: AsrStreamStats = {
    ok: false,
    frameCount: 0,
    textFieldPath: null,
    text: '',
    terminal: '（流结束但无终帧标记）',
    frameSamples: [],
  };

  const res = await request(body);
  stats.ok = res.ok;
  stats.httpStatus = res.status;
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
      const text = extractTextValue(frame);
      if (text) {
        if (!stats.textFieldPath) stats.textFieldPath = text.path;
        stats.text += text.value;
      }
      if (frame?.error) {
        stats.terminal = JSON.stringify(frame.error);
        sentinel = true;
        break;
      }
      if (
        stats.frameCount < 2 ||
        text ||
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

/** 输出一次探测的结果摘要 */
function report(stats: AsrStreamStats, label: string): void {
  if (!stats.ok) {
    console.log(`❌ ${label}：HTTP ${stats.httpStatus}`);
    console.log((stats.httpBody ?? '').slice(0, 500));
    console.log();
    return;
  }
  console.log(`共解析 ${stats.frameCount} 帧`);
  console.log(`文本字段路径：${stats.textFieldPath ?? '⚠️ 未识别到任何文本字段'}`);
  console.log(`累计识别文本：「${stats.text}」`);
  console.log('帧样例（前 2 帧 + 含文本/终帧）：');
  for (const sample of stats.frameSamples) console.log('  ', sample);
  console.log('终帧：', stats.terminal);
  console.log();
}

async function main() {
  const wav = await synthesizeFixtureWav();

  const baseline = await probeAsrStream(wav, '契约点 1/2：ASR 流式帧结构（fetch 直连，不带 asr_options）', false);
  report(baseline, '不带 asr_options');

  const withOptions = await probeAsrStream(wav, '契约点 2/2：asr_options 透传（模拟 openai SDK 直接放入 body）', true);
  report(withOptions, '带 asr_options');

  console.log('▶ 结论\n');
  if (baseline.textFieldPath) {
    console.log(`文本字段路径="${baseline.textFieldPath}"。`);
    console.log(
      '请将该路径收敛进 SttService.extractTextPayload 的候选列表首位；如与预期不符仅需改这一处。',
    );
  } else {
    console.error('❌ 流中未识别到文本字段：请将上方帧样例反馈给开发者，调整字段路径。');
  }
  console.log(
    withOptions.ok
      ? 'asr_options 直接放入 body 被上游接受，openai SDK 透传方案可行。'
      : `asr_options 透传失败（HTTP ${withOptions.httpStatus}）：SttService 需改用底层请求或去掉该参数。`,
  );
  console.log(
    baseline.text.includes(TEXT.replace(/[，。]/g, '')) || TEXT.includes(baseline.text.replace(/[，。、\s]/g, ''))
      ? '✅ 转写内容与原句吻合。'
      : '⚠️ 转写与原句不完全一致，请人工核对上方文本（标点差异属正常）。',
  );
}

main().catch((error) => {
  console.error('❌ 验证失败：', error);
  process.exit(1);
});
