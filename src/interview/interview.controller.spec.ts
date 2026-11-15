import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Observable, of } from 'rxjs';
import { InterviewController } from './interview.controller';
import { InterviewService } from './interview.service';

describe('InterviewController', () => {
  let controller: InterviewController;

  const mockService = {
    createSession: jest.fn(),
    listSessions: jest.fn(),
    getCurrentSession: jest.fn(),
    getSessionDetail: jest.fn(),
    submitAnswer: jest.fn(),
    submitAnswerSse: jest.fn(),
    finishSession: jest.fn(),
    cancelSession: jest.fn(),
    getReport: jest.fn(),
    getQuestionAudio: jest.fn(),
    getQuestionAudioStreamEvents: jest.fn(),
  } as any;

  const req = { user: { userId: 'user-1' } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InterviewController],
      providers: [{ provide: InterviewService, useValue: mockService }],
    }).compile();
    controller = module.get<InterviewController>(InterviewController);
  });

  it('should delegate createSession to service with current user', async () => {
    mockService.createSession.mockResolvedValue({ _id: 's1' });
    const result = await controller.createSession({} as any, req as any);
    expect(result).toEqual({ _id: 's1' });
    expect(mockService.createSession).toHaveBeenCalledWith({}, 'user-1');
  });

  it('listSessions should delegate query with current user', async () => {
    const query = { page: 2, pageSize: 5, status: 'completed' } as any;
    const data = { list: [], total: 0, page: 2, pageSize: 5 };
    mockService.listSessions.mockResolvedValue(data);
    expect(await controller.listSessions(query, req as any)).toBe(data);
    expect(mockService.listSessions).toHaveBeenCalledWith('user-1', query);
  });

  it('listSessions should convert unknown errors to internal server error', async () => {
    mockService.listSessions.mockRejectedValue(new Error('boom'));
    await expect(controller.listSessions({}, req as any)).rejects.toThrow(
      '服务器内部错误',
    );
  });

  it('should wrap business exceptions through unchanged', async () => {
    mockService.createSession.mockRejectedValue(
      new ConflictException('已有进行中的会话'),
    );
    await expect(
      controller.createSession({} as any, req as any),
    ).rejects.toThrow(ConflictException);
  });

  it('should convert unknown errors to internal server error', async () => {
    mockService.getSessionDetail.mockRejectedValue(new Error('boom'));
    await expect(
      controller.getSessionDetail('507f1f77bcf86cd799439011', req as any),
    ).rejects.toThrow('服务器内部错误');
  });

  it('submitAnswer should wrap unknown errors as internal server error', async () => {
    mockService.submitAnswer.mockRejectedValue(new Error('boom'));
    await expect(
      controller.submitAnswer(
        '507f1f77bcf86cd799439011',
        { content: '回答' },
        req as any,
      ),
    ).rejects.toThrow('服务器内部错误');
  });

  it('finishSession should pass business exceptions through unchanged', async () => {
    mockService.finishSession.mockRejectedValue(
      new ConflictException('该面试会话已结束'),
    );
    await expect(
      controller.finishSession('507f1f77bcf86cd799439011', req as any),
    ).rejects.toThrow(ConflictException);
  });

  it('reverse-suggestions should wrap the list as { suggestions } per the API contract', async () => {
    // docs/api/mock-interview.md 第 6 节：data 为 { suggestions: [...] }
    const suggestions = [
      { title: '团队技术栈', content: '想了解团队核心的技术栈？' },
    ];
    mockService.getReverseSuggestions = jest
      .fn()
      .mockResolvedValue(suggestions);

    const result = await controller.getReverseSuggestions(
      '507f1f77bcf86cd799439011',
      req as any,
    );

    expect(result).toEqual({ suggestions });
    expect(mockService.getReverseSuggestions).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439011',
      'user-1',
    );
  });

  it('getCurrentSession should return active flag and session', async () => {
    mockService.getCurrentSession.mockResolvedValue(null);
    expect(await controller.getCurrentSession(req as any)).toEqual({
      active: false,
      session: null,
    });
  });

  it('submitAnswerSse should throw business errors before headers are set', async () => {
    // 校验前置到 service 的 await 阶段：此处抛出时尚未设置 SSE 头
    mockService.submitAnswerSse.mockRejectedValue(
      new BadRequestException('会话 ID 格式不正确'),
    );
    const res = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn() };
    await expect(
      controller.submitAnswerSse(
        'bad-id',
        { content: '回答' },
        req as any,
        res as any,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(res.write).not.toHaveBeenCalled();
  });

  it('submitAnswerSse should stream events as SSE frames after validation', async () => {
    mockService.submitAnswerSse.mockResolvedValue(
      of({ type: 'init', message: '开始处理回答' }),
    );
    const res = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn() };
    const reqObj = { user: { userId: 'user-1' }, on: jest.fn() };

    await controller.submitAnswerSse(
      '507f1f77bcf86cd799439011',
      { content: '回答' },
      reqObj as any,
      res as any,
    );

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/event-stream',
    );
    expect(res.write).toHaveBeenCalledWith(
      'data: {"type":"init","message":"开始处理回答"}\n\n',
    );
    expect(res.end).toHaveBeenCalled();
  });

  it('submitAnswerSse should not leak internal error details in the error frame', async () => {
    mockService.submitAnswerSse.mockResolvedValue(
      new Observable((subscriber) => {
        subscriber.error(new Error('mongo uri and credentials leaked'));
      }),
    );
    const res = { setHeader: jest.fn(), write: jest.fn(), end: jest.fn() };
    const reqObj = { user: { userId: 'user-1' }, on: jest.fn() };

    await controller.submitAnswerSse(
      '507f1f77bcf86cd799439011',
      { content: '回答' },
      reqObj as any,
      res as any,
    );

    // 非 HttpException 只给通用文案；业务异常消息原样保留
    expect(res.write).toHaveBeenCalledWith(
      'data: {"type":"error","message":"服务器内部错误"}\n\n',
    );
    expect(JSON.stringify(res.write.mock.calls)).not.toContain('mongo uri');
  });

  describe('getQuestionTts', () => {
    const res = { setHeader: jest.fn(), send: jest.fn() };

    it('should send wav binary with cache headers', async () => {
      const audio = { buffer: Buffer.from('wav-bytes'), mimeType: 'audio/wav' };
      mockService.getQuestionAudio.mockResolvedValue(audio);

      await controller.getQuestionTts(
        '507f1f77bcf86cd799439011',
        { round: 2 },
        req as any,
        res as any,
      );

      expect(mockService.getQuestionAudio).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        'user-1',
        2,
      );
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'audio/wav');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'private, max-age=86400',
      );
      expect(res.send).toHaveBeenCalledWith(audio.buffer);
    });

    it('should wrap unknown errors as internal server error', async () => {
      mockService.getQuestionAudio.mockRejectedValue(new Error('boom'));
      await expect(
        controller.getQuestionTts(
          '507f1f77bcf86cd799439011',
          { round: 2 },
          req as any,
          res as any,
        ),
      ).rejects.toThrow('服务器内部错误');
    });
  });

  describe('getQuestionTtsStream', () => {
    const res = {
      setHeader: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    };
    const req = {
      user: { userId: 'user-1' },
      on: jest.fn(),
    };

    it('should stream events as SSE frames with streaming headers', async () => {
      mockService.getQuestionAudioStreamEvents.mockResolvedValue(
        of(
          { type: 'meta', sampleRate: 24000, channels: 1 },
          { type: 'chunk', data: 'aGk=' },
          { type: 'done' },
        ),
      );

      await controller.getQuestionTtsStream(
        '507f1f77bcf86cd799439011',
        { round: 1 },
        req as any,
        res as any,
      );

      expect(mockService.getQuestionAudioStreamEvents).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        'user-1',
        1,
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream',
      );
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
      expect(res.write).toHaveBeenNthCalledWith(
        1,
        'data: {"type":"meta","sampleRate":24000,"channels":1}\n\n',
      );
      expect(res.write).toHaveBeenNthCalledWith(
        2,
        'data: {"type":"chunk","data":"aGk="}\n\n',
      );
      expect(res.write).toHaveBeenNthCalledWith(3, 'data: {"type":"done"}\n\n');
      expect(res.end).toHaveBeenCalled();
    });

    it('should throw business errors before headers are set', async () => {
      mockService.getQuestionAudioStreamEvents.mockRejectedValue(
        new BadRequestException('该轮次的问题不存在'),
      );

      await expect(
        controller.getQuestionTtsStream(
          '507f1f77bcf86cd799439011',
          { round: 9 },
          req as any,
          res as any,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(res.setHeader).not.toHaveBeenCalled();
    });

    it('should register the disconnect listener before awaiting the stream', async () => {
      const handlers: Record<string, () => void> = {};
      const disconnectableReq = {
        user: { userId: 'user-1' },
        on: jest.fn((event: string, cb: () => void) => {
          handlers[event] = cb;
        }),
      };

      // 客户端在 service 校验/建连期间断开
      mockService.getQuestionAudioStreamEvents.mockImplementation(async () => {
        handlers.close?.();
        return of({ type: 'meta', sampleRate: 24000, channels: 1 });
      });

      await controller.getQuestionTtsStream(
        '507f1f77bcf86cd799439011',
        { round: 1 },
        disconnectableReq as any,
        res as any,
      );

      // 断开后不应设置 SSE 头、不应订阅事件流（避免无人收听的合成费用）
      expect(res.setHeader).not.toHaveBeenCalled();
      expect(res.write).not.toHaveBeenCalled();
      expect(res.end).not.toHaveBeenCalled();
    });
  });
});
