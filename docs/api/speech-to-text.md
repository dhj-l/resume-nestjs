# 语音转文字（STT）接口

通用语音识别能力，基于小米 MiMo-V2.5-ASR（OpenAI 兼容接口，与 TTS 共用 `MIMO_API_KEY`）。
上传一段音频，服务端以 **SSE 流式**返回识别文本增量；文本增量的上游字段契约由
`scripts/verify-mimo-asr-stream.ts` 实测校准（`choices[0].delta.content`，终帧 `[DONE]`）。

## 1. 接口定义

`POST /api/v1/ai/stt/stream`

- 鉴权：`Authorization: Bearer <JWT>`（同其他业务接口）
- 请求体：`multipart/form-data`

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `audio` | file | 是 | 音频二进制。支持 wav / webm / mp3 / mp4(m4a) / ogg / flac，单文件业务上限默认 20MB（`MIMO_ASR_MAX_BYTES` 可调）；上传路由另有 50MB 内存防滥用护栏，超过护栏直接 413 |

### 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MIMO_API_KEY` | 无 | 与 TTS 共用，未配置时接口不可用 |
| `MIMO_ASR_MODEL` | `mimo-v2.5-asr` | 识别模型 |
| `MIMO_ASR_LANGUAGE` | `auto` | 识别语言，可指定 `zh` / `en` 等 |
| `MIMO_ASR_MAX_BYTES` | `20971520` | 音频大小上限（字节） |
| `MIMO_BASE_URL` | 官方地址 | 与 TTS 共用，联调代理时可覆盖 |

## 2. SSE 响应

```
Content-Type: text/event-stream
Cache-Control: no-cache
X-Accel-Buffering: no
```

每帧格式 `data: <JSON>\n\n`，JSON 结构：

| type | 字段 | 说明 |
| --- | --- | --- |
| `delta` | `text: string` | 识别文本增量，按顺序拼接即完整结果 |
| `done` | `text: string` | 流正常结束，`text` 为完整转写文本 |
| `error` | `message: string` | 流中途出错，随后连接关闭 |

示例：

```
data: {"type":"delta","text":"今天天气不错"}

data: {"type":"delta","text":"，我们一起去公园散步吧。"}

data: {"type":"done","text":"今天天气不错，我们一起去公园散步吧。"}
```

### 错误处理

- **建流前失败**（无文件、格式不支持、音频过大、上游鉴权/余额问题）：
  未发出 SSE 头前即失败，走全局异常过滤器，返回统一 JSON 错误包络（400 / 401 / 402 / 429 / 500 / 502）。
- **流中途失败**：发出 `{"type":"error","message":"…"}` 帧后关闭连接。
- **客户端断开**：服务端立即终止上游识别请求，不再计费产生后续结果。

## 3. 前端接入建议

上游 MiMo ASR 只有「整段音频输入、文字流式输出」的 HTTP 接口，**没有 WebSocket 音频流式输入**，
因此「边说边出字」由前端分句策略实现，后端接口不变：

### 方式 A：整段转写（最简，先跑通链路）

1. `MediaRecorder` 录音，用户点「停止」后将 Blob 作为 `audio` 字段上传
2. `fetch` + `ReadableStream`（或 `EventSource` polyfill，因需 POST）读取 SSE
3. `delta` 逐段追加渲染，`done` 时取完整文本（如填入面试回答框）

```ts
const res = await fetch('/api/v1/ai/stt/stream', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: formData, // formData.append('audio', blob, 'answer.wav')
});
const reader = res.body!.getReader();
// 按 \n\n 分帧，解析 data: JSON，type === 'delta' 时追加到展示区
```

### 方式 B：句子级伪实时（推荐目标形态）

1. `AudioWorklet` 采集 PCM16（16kHz 单声道即可），实时计算能量做静音检测（VAD）
2. 检测到停顿（如连续静音 500–800ms）即把这一句封装为 WAV
3. 立即 `POST /ai/stt/stream`，`delta` 到达后按句追加显示
4. 说话与识别并行：上一句在转写时用户继续说下一句，体感延迟约 1 秒

注意事项：

- 录音采样率建议 16000Hz（语音识别足够，音频体积小、上传快）
- 分句过短会丢失上下文导致准确率下降，建议单句 ≥1 秒、≤15 秒
- 上传用 `audio/wav`（本地封装 WAV 头 + PCM），浏览器兼容性最好
- 并发控制：同一时刻仅保留一个在途识别请求，新句子排队

## 4. 与 mock interview 的关系

本接口是 `src/ai/` 下的通用能力，不绑定面试会话。模拟面试「语音回答」由前端组合实现：
录音（分句）→ 调本接口转写 → 文本填入 `POST /interview/sessions/:id/answers`（`channel: "voice"`），
评估链路复用现有文本回答流程。
