import {
  MAIN_PHASE_HARD_STOP_MS,
  QuestionTypeEnum,
} from '../constants/level.constants';
import type { InterviewOutlineTopic } from '../schemas/interview-outline.schema';
import {
  buildCoverageQuestion,
  remainingOutlineTopics,
  shouldEnterReversePhase,
} from './outline-coverage.utils';

describe('outline-coverage.utils - 大纲覆盖与结束门禁', () => {
  const outline: InterviewOutlineTopic[] = [
    {
      key: 'self_intro',
      title: '自我介绍',
      questionType: QuestionTypeEnum.SelfIntro,
    },
    {
      key: 'order_system',
      title: '订单系统重构',
      questionType: QuestionTypeEnum.Project,
    },
    {
      key: 'tcp',
      title: 'TCP 三次握手',
      questionType: QuestionTypeEnum.Fundamentals,
    },
    {
      key: 'open_q',
      title: '线上排查思路',
      questionType: QuestionTypeEnum.OpenQuestion,
    },
  ];

  describe('remainingOutlineTopics', () => {
    it('should return topics not yet asked, keeping the outline order', () => {
      const remaining = remainingOutlineTopics(outline, ['self_intro', 'tcp']);

      expect(remaining.map((topic) => topic.key)).toEqual([
        'order_system',
        'open_q',
      ]);
    });

    it('should return an empty list when every topic has been asked', () => {
      expect(
        remainingOutlineTopics(
          outline,
          outline.map((topic) => topic.key),
        ),
      ).toEqual([]);
    });

    it('should ignore asked keys that are not part of the outline', () => {
      // 大纲外自主出题（adhoc_*）会写入 askedTopicKeys，但不影响剩余主题
      const remaining = remainingOutlineTopics(outline, [
        'self_intro',
        'adhoc_something',
      ]);

      expect(remaining.map((topic) => topic.key)).toEqual([
        'order_system',
        'tcp',
        'open_q',
      ]);
    });

    it('should tolerate a missing outline or asked list', () => {
      expect(
        remainingOutlineTopics(undefined as any, undefined as any),
      ).toEqual([]);
    });
  });

  describe('shouldEnterReversePhase - 覆盖前置条件', () => {
    it('should not end while any outline topic is left, regardless of the policy', () => {
      // 核心需求：主题没问完就不得进入反问环节，即使已达时长上限
      expect(
        shouldEnterReversePhase({
          endPolicy: 'must_end',
          aiRequestsEnd: true,
          remainingCount: 3,
          elapsedMs: 61 * 60_000,
        }),
      ).toBe(false);
      expect(
        shouldEnterReversePhase({
          endPolicy: 'can_end',
          aiRequestsEnd: true,
          remainingCount: 1,
          elapsedMs: 47 * 60_000,
        }),
      ).toBe(false);
      expect(
        shouldEnterReversePhase({
          endPolicy: 'cannot_end',
          aiRequestsEnd: true,
          remainingCount: 2,
          elapsedMs: 20 * 60_000,
        }),
      ).toBe(false);
    });

    it('should follow the duration policy once the outline is fully covered', () => {
      expect(
        shouldEnterReversePhase({
          endPolicy: 'must_end',
          aiRequestsEnd: false,
          remainingCount: 0,
          elapsedMs: 61 * 60_000,
        }),
      ).toBe(true);
      expect(
        shouldEnterReversePhase({
          endPolicy: 'can_end',
          aiRequestsEnd: true,
          remainingCount: 0,
          elapsedMs: 45 * 60_000,
        }),
      ).toBe(true);
      // 政策允许但 AI 判断还能继续考察：保持主体阶段
      expect(
        shouldEnterReversePhase({
          endPolicy: 'can_end',
          aiRequestsEnd: false,
          remainingCount: 0,
          elapsedMs: 45 * 60_000,
        }),
      ).toBe(false);
      // 覆盖完成但时长/题数条件未满足：继续出题（大纲外自主出题）
      expect(
        shouldEnterReversePhase({
          endPolicy: 'cannot_end',
          aiRequestsEnd: true,
          remainingCount: 0,
          elapsedMs: 18 * 60_000,
        }),
      ).toBe(false);
    });

    it('should end unconditionally at the hard stop to keep the phase bounded', () => {
      // 兜底：模型 topicKey 标注异常导致主题永远补不齐时，主体阶段仍必须能结束
      expect(
        shouldEnterReversePhase({
          endPolicy: 'must_end',
          aiRequestsEnd: false,
          remainingCount: 5,
          elapsedMs: MAIN_PHASE_HARD_STOP_MS,
        }),
      ).toBe(true);
      expect(
        shouldEnterReversePhase({
          endPolicy: 'must_end',
          aiRequestsEnd: false,
          remainingCount: 5,
          elapsedMs: MAIN_PHASE_HARD_STOP_MS - 60_000,
        }),
      ).toBe(false);
    });
  });

  describe('buildCoverageQuestion - 推进剩余主题的本地兜底题', () => {
    it('should reference the topic title and stay within one question mark', () => {
      const question = buildCoverageQuestion(outline[1]);

      expect(question).toContain('订单系统重构');
      expect((question.match(/[?？]/g) ?? []).length).toBeLessThanOrEqual(1);
    });

    it('should cover every question type without leaving a placeholder behind', () => {
      for (const topic of outline) {
        const question = buildCoverageQuestion(topic);

        expect(question).toContain(topic.title);
        expect(question).not.toContain('undefined');
      }
    });
  });
});
