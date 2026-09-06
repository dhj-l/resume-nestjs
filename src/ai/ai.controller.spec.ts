import { BadRequestException } from '@nestjs/common';
import { AiController } from './ai.controller';
import { SttStream } from './stt.service';

describe('AiController - POST /ai/stt/stream', () => {
  let controller: AiController;

  const mockTranscribeStream = jest.fn();
  const handle = {
    iterator: (async function* () {})(),
    abort: jest.fn(),
  };

  const res = {
    setHeader: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
  };
  const req = {
    on: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockTranscribeStream.mockResolvedValue(handle);
    controller = new AiController({
      transcribeStream: mockTranscribeStream,
    } as any);
  });

  function makeSttStream(deltas: string[]): SttStream {
    return {
      iterator: (async function* () {
        for (const delta of deltas) {
          yield delta;
        }
      })(),
      abort: jest.fn(),
    };
  }

  it('should reject a request without an audio file', async () => {
    await expect(
      controller.transcribeStream(undefined, req as any, res as any),
    ).rejects.toThrow(BadRequestException);
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('should set SSE headers before streaming', async () => {
    mockTranscribeStream.mockResolvedValue(makeSttStream(['你好']));

    await controller.transcribeStream(makeFile(), req as any, res as any);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/event-stream',
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
    expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
  });

  it('should pass file buffer, mimetype and an abort signal to the service', async () => {
    mockTranscribeStream.mockResolvedValue(makeSttStream(['你好']));

    await controller.transcribeStream(makeFile(), req as any, res as any);

    expect(mockTranscribeStream).toHaveBeenCalledWith(
      {
        buffer: Buffer.from('fake-wav'),
        mimeType: 'audio/wav',
      },
      { signal: expect.any(AbortSignal) },
    );
  });

  it('should emit delta events followed by a done event with the full text', async () => {
    mockTranscribeStream.mockResolvedValue(makeSttStream(['今天', '天气不错']));

    await controller.transcribeStream(makeFile(), req as any, res as any);

    expect(res.write).toHaveBeenNthCalledWith(
      1,
      `data: ${JSON.stringify({ type: 'delta', text: '今天' })}\n\n`,
    );
    expect(res.write).toHaveBeenNthCalledWith(
      2,
      `data: ${JSON.stringify({ type: 'delta', text: '天气不错' })}\n\n`,
    );
    expect(res.write).toHaveBeenNthCalledWith(
      3,
      `data: ${JSON.stringify({ type: 'done', text: '今天天气不错' })}\n\n`,
    );
    expect(res.end).toHaveBeenCalled();
  });

  it('should emit an error event and close the stream on mid-stream failure', async () => {
    mockTranscribeStream.mockResolvedValue({
      iterator: (async function* () {
        yield '你';
        throw new Error('语音识别失败：远端服务异常');
      })(),
      abort: jest.fn(),
    });

    await controller.transcribeStream(makeFile(), req as any, res as any);

    expect(res.write).toHaveBeenLastCalledWith(
      `data: ${JSON.stringify({
        type: 'error',
        message: '语音识别失败：远端服务异常',
      })}\n\n`,
    );
    expect(res.end).toHaveBeenCalled();
  });

  it('should propagate validation errors raised before the stream opens', async () => {
    mockTranscribeStream.mockRejectedValue(
      new BadRequestException('不支持的音频格式'),
    );

    await expect(
      controller.transcribeStream(makeFile(), req as any, res as any),
    ).rejects.toThrow('不支持的音频格式');
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it('should abort the upstream and close when the client disconnects', async () => {
    // iterator 永远挂起，模拟识别进行中
    let releaseNext: (() => void) | undefined;
    mockTranscribeStream.mockResolvedValue({
      iterator: (async function* () {
        yield '第一段';
        await new Promise<void>((resolve) => (releaseNext = resolve));
        yield '第二段';
      })(),
      abort: handle.abort,
    });

    const closeHandlers: Array<() => void> = [];
    req.on.mockImplementation((event: string, cb: () => void) => {
      if (event === 'close') closeHandlers.push(cb);
    });

    const pending = controller.transcribeStream(
      makeFile(),
      req as any,
      res as any,
    );
    // 等第一段已写出、迭代器挂起
    await new Promise((resolve) => setImmediate(resolve));
    expect(res.write).toHaveBeenCalledWith(
      `data: ${JSON.stringify({ type: 'delta', text: '第一段' })}\n\n`,
    );

    closeHandlers.forEach((cb) => cb());
    releaseNext?.();
    await pending;

    expect(handle.abort).toHaveBeenCalled();
    expect(res.end).toHaveBeenCalled();
    expect(res.write).not.toHaveBeenCalledWith(
      expect.stringContaining('第二段'),
    );
  });

  it('should abort the upstream when the client disconnects during connect', async () => {
    // 建连 await 挂起期间断开：上游必须被中止，且不写任何帧
    let resolveConnect: ((h: SttStream) => void) | undefined;
    mockTranscribeStream.mockReturnValue(
      new Promise((resolve) => (resolveConnect = resolve)),
    );

    const closeHandlers: Array<() => void> = [];
    req.on.mockImplementation((event: string, cb: () => void) => {
      if (event === 'close') closeHandlers.push(cb);
    });

    const pending = controller.transcribeStream(
      makeFile(),
      req as any,
      res as any,
    );
    await new Promise((resolve) => setImmediate(resolve));

    closeHandlers.forEach((cb) => cb());
    resolveConnect!(handle);
    await pending;

    expect(handle.abort).toHaveBeenCalled();
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.write).not.toHaveBeenCalled();
  });
});

function makeFile(): Express.Multer.File {
  return {
    fieldname: 'audio',
    originalname: 'answer.wav',
    encoding: '7bit',
    mimetype: 'audio/wav',
    size: 8,
    buffer: Buffer.from('fake-wav'),
    stream: undefined as any,
    destination: '',
    filename: '',
    path: '',
  };
}
