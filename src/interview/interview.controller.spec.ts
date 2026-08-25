import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InterviewController } from './interview.controller';
import { InterviewService } from './interview.service';

describe('InterviewController', () => {
  let controller: InterviewController;

  const mockService = {
    createSession: jest.fn(),
    getCurrentSession: jest.fn(),
    getSessionDetail: jest.fn(),
    submitAnswer: jest.fn(),
    submitAnswerSse: jest.fn(),
    finishSession: jest.fn(),
    cancelSession: jest.fn(),
    getReport: jest.fn(),
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

  it('getCurrentSession should return active flag and session', async () => {
    mockService.getCurrentSession.mockResolvedValue(null);
    expect(await controller.getCurrentSession(req as any)).toEqual({
      active: false,
      session: null,
    });
  });

  it('submitAnswerSse should throw business errors before headers are set', () => {
    mockService.submitAnswerSse.mockImplementation(() => {
      throw new BadRequestException('会话 ID 格式不正确');
    });
    expect(() =>
      controller.submitAnswerSse(
        'bad-id',
        { content: '回答' },
        req as any,
        {} as any,
      ),
    ).toThrow(BadRequestException);
  });
});
