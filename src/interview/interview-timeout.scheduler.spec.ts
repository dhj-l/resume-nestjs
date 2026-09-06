import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { InterviewTimeoutScheduler } from './interview-timeout.scheduler';

describe('InterviewTimeoutScheduler - 过期会话清扫', () => {
  let scheduler: InterviewTimeoutScheduler;

  const mockSessionModel = {
    updateMany: jest.fn(),
  } as any;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InterviewTimeoutScheduler,
        {
          provide: getModelToken('InterviewSession'),
          useValue: mockSessionModel,
        },
      ],
    }).compile();
    scheduler = module.get<InterviewTimeoutScheduler>(
      InterviewTimeoutScheduler,
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should close only expired in_progress sessions', async () => {
    mockSessionModel.updateMany.mockResolvedValue({ modifiedCount: 2 });

    const closed = await scheduler.sweepExpiredSessions();

    expect(closed).toBe(2);
    expect(mockSessionModel.updateMany).toHaveBeenCalledWith(
      {
        status: 'in_progress',
        expiresAt: { $lt: expect.any(Date) },
      },
      {
        $set: {
          status: 'cancelled',
          endedReason: 'timeout',
          endedAt: expect.any(Date),
        },
      },
    );
  });

  it('should return zero when nothing expired', async () => {
    mockSessionModel.updateMany.mockResolvedValue({ modifiedCount: 0 });
    expect(await scheduler.sweepExpiredSessions()).toBe(0);
  });
});
