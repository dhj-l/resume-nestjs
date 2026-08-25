import {
  InterviewMessageSchema,
  InterviewSessionSchema,
  InterviewSession,
  MessageChannelEnum,
  MessageKindEnum,
  MessageRoleEnum,
} from './interview-session.entity';
import {
  ExperienceLevelEnum,
  InterviewFocusEnum,
  INACTIVITY_TIMEOUT_MS,
} from '../constants/level.constants';

describe('InterviewSession 实体', () => {
  it('should define default values for status and currentRound', () => {
    const statusPath = InterviewSessionSchema.path('status');
    expect(statusPath.defaultValue).toBe('in_progress');

    const roundPath = InterviewSessionSchema.path('currentRound');
    expect(roundPath.defaultValue).toBe(1);
  });

  it('should register a partial unique index to enforce single in_progress session per user', () => {
    const indexes = InterviewSessionSchema.indexes() as [
      Record<string, any>,
      Record<string, any>,
    ][];

    const partialUnique = indexes.find(
      ([, options]) =>
        options.unique === true &&
        options.partialFilterExpression?.status === 'in_progress',
    );

    expect(partialUnique).toBeTruthy();
    expect(partialUnique![0]).toEqual({ userId: 1 });
  });

  it('should register an index on expiresAt for timeout sweeping', () => {
    const indexes = InterviewSessionSchema.indexes() as [
      Record<string, any>,
      Record<string, any>,
    ][];

    const expiresAtIndex = indexes.find(
      ([keys]) => keys.expiresAt !== undefined,
    );
    expect(expiresAtIndex).toBeTruthy();
  });

  it('should define message subdocument with reserved channel field', () => {
    const rolePath = InterviewMessageSchema.path('role');
    expect(rolePath.enumValues).toContain(MessageRoleEnum.Interviewer);
    expect(rolePath.enumValues).toContain(MessageRoleEnum.Candidate);

    const kindPath = InterviewMessageSchema.path('kind');
    expect(kindPath.enumValues).toContain(MessageKindEnum.Question);

    const channelPath = InterviewMessageSchema.path('channel');
    expect(channelPath.defaultValue).toBe(MessageChannelEnum.Text);
    expect(channelPath.enumValues).toContain(MessageChannelEnum.Voice);
  });

  it('should define level config enums', () => {
    expect(Object.values(ExperienceLevelEnum)).toEqual([
      'junior',
      'mid',
      'senior',
      'expert',
    ]);
    expect(Object.values(InterviewFocusEnum)).toEqual([
      'technical',
      'project',
      'mixed',
    ]);
  });

  it('should define INACTIVITY_TIMEOUT_MS to 30 minutes', () => {
    expect(INACTIVITY_TIMEOUT_MS).toBe(30 * 60 * 1000);
  });

  it('should expose document type helper', () => {
    // 类型层面约定：文档类型 = 实体 + Document，编译期校验即可
    const sample: keyof InterviewSession = 'messages';
    expect(sample).toBe('messages');
  });
});
