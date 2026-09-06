import {
  AnswerFeedbackSchema,
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
  InterviewModeEnum,
  InterviewPhaseEnum,
  InterviewStageEnum,
  QuestionTypeEnum,
  INACTIVITY_TIMEOUT_MS,
} from '../constants/level.constants';

describe('InterviewSession 实体', () => {
  it('should define default values for status, currentRound and phase', () => {
    const statusPath = InterviewSessionSchema.path('status');
    expect(statusPath.defaultValue).toBe('in_progress');

    const roundPath = InterviewSessionSchema.path('currentRound');
    expect(roundPath.defaultValue).toBe(1);

    const phasePath = InterviewSessionSchema.path('phase');
    expect(phasePath.defaultValue).toBe(InterviewPhaseEnum.Main);
    expect(phasePath.enumValues).toContain(InterviewPhaseEnum.Reverse);
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

  it('should define message questionType enum with all interview question types', () => {
    const questionTypePath = InterviewMessageSchema.path('questionType');
    for (const value of Object.values(QuestionTypeEnum)) {
      expect(questionTypePath.enumValues).toContain(value);
    }
  });

  it('should define answer feedback subdocument with three dimensions', () => {
    const completenessPath = AnswerFeedbackSchema.path('completeness');
    expect(completenessPath.options.min).toBe(0);
    expect(completenessPath.options.max).toBe(100);

    expect(AnswerFeedbackSchema.path('logic')).toBeTruthy();
    expect(AnswerFeedbackSchema.path('depth')).toBeTruthy();
    expect(AnswerFeedbackSchema.path('comment')).toBeTruthy();
    expect(InterviewMessageSchema.path('feedback')).toBeTruthy();
  });

  it('should define level config enums with mode and stage dimensions', () => {
    expect(Object.values(ExperienceLevelEnum)).toEqual([
      'junior',
      'mid',
      'senior',
      'expert',
    ]);
    expect(Object.values(InterviewModeEnum)).toEqual(['campus', 'experienced']);
    expect(Object.values(InterviewStageEnum)).toEqual([
      'first',
      'second',
      'third',
    ]);
    // 旧版 focus 维度仅为历史数据兼容保留
    expect(Object.values(InterviewFocusEnum)).toEqual([
      'technical',
      'project',
      'mixed',
    ]);
  });

  it('should define INACTIVITY_TIMEOUT_MS to 45 minutes for long interviews', () => {
    expect(INACTIVITY_TIMEOUT_MS).toBe(45 * 60 * 1000);
  });

  it('should expose document type helper', () => {
    // 类型层面约定：文档类型 = 实体 + Document，编译期校验即可
    const sample: keyof InterviewSession = 'messages';
    expect(sample).toBe('messages');
  });
});
