import type { InterviewMessage } from '../entities/interview-session.entity';
import { MessageRoleEnum } from '../entities/interview-session.entity';
import {
  HISTORY_MESSAGE_LIMIT,
  TRANSCRIPT_BUDGET,
  TRANSCRIPT_MESSAGE_MAX,
  formatConversationHistory,
  formatTranscript,
  formatSpeakerLine,
  speakerLabel,
} from './transcript.utils';

const interviewer = (
  content: string,
  round = 1,
  questionType?: string,
): InterviewMessage =>
  ({
    role: MessageRoleEnum.Interviewer,
    content,
    round,
    kind: 'question',
    ...(questionType ? { questionType } : {}),
  }) as unknown as InterviewMessage;

const candidate = (
  content: string,
  round = 1,
  questionType?: string,
): InterviewMessage =>
  ({
    role: MessageRoleEnum.Candidate,
    content,
    round,
    kind: 'answer',
    ...(questionType ? { questionType } : {}),
  }) as unknown as InterviewMessage;

describe('transcript.utils - 转录格式化', () => {
  describe('formatConversationHistory', () => {
    it('should keep the legacy line format byte-for-byte', () => {
      expect(speakerLabel(MessageRoleEnum.Interviewer)).toBe('面试官');
      expect(speakerLabel(MessageRoleEnum.Candidate)).toBe('候选人');
      expect(formatSpeakerLine(interviewer('请自我介绍', 1))).toBe(
        '面试官：请自我介绍',
      );
      // 提示词实时区格式变更会影响前缀缓存命中，此处锁定历史输出
      expect(
        formatConversationHistory([
          interviewer('请自我介绍', 1),
          candidate('我是张三', 1),
        ]),
      ).toBe('面试官：请自我介绍\n候选人：我是张三');
    });

    it('should keep only the most recent messages', () => {
      const messages = Array.from(
        { length: HISTORY_MESSAGE_LIMIT + 5 },
        (_, i) => interviewer(`问题 ${i + 1}`, i + 1),
      );

      const history = formatConversationHistory(messages).split('\n');

      expect(history).toHaveLength(HISTORY_MESSAGE_LIMIT);
      expect(history[0]).toBe(`面试官：问题 6`);
    });

    it('should tolerate an empty transcript', () => {
      expect(formatConversationHistory([])).toBe('');
    });
  });

  describe('formatTranscript', () => {
    it('should annotate speaker, round and question type', () => {
      const transcript = formatTranscript([
        interviewer('请自我介绍', 1, 'self_intro'),
        candidate('我是张三', 1),
        candidate('团队技术栈是什么？', 12, 'reverse'),
      ]);

      expect(transcript).toBe(
        [
          '面试官（第 1 轮·self_intro）：请自我介绍',
          '候选人（第 1 轮）：我是张三',
          '候选人（第 12 轮·reverse）：团队技术栈是什么？',
        ].join('\n\n'),
      );
    });

    it('should truncate an over-long single message with a notice', () => {
      const transcript = formatTranscript([candidate('长'.repeat(3000), 1)]);

      expect(transcript).toContain('……（内容过长已截断）');
      expect(transcript.length).toBeLessThan(TRANSCRIPT_MESSAGE_MAX + 64);
    });

    it('should keep every round within budget by shrinking each message', () => {
      // 40 轮长回答：总长远超预算，但每一轮都必须保留（报告要覆盖全部考察主题）
      const messages = Array.from({ length: 40 }, (_, i) =>
        candidate('回答'.repeat(400), i + 1),
      );

      const transcript = formatTranscript(messages);

      expect(transcript).not.toContain('较早的对话因长度限制已省略');
      for (let round = 1; round <= 40; round++) {
        expect(transcript).toContain(`候选人（第 ${round} 轮）：`);
      }
      expect(transcript.length).toBeLessThanOrEqual(TRANSCRIPT_BUDGET);
    });

    it('should drop the oldest messages when even the floor exceeds the budget', () => {
      const messages = Array.from({ length: 200 }, (_, i) =>
        candidate('回答'.repeat(200), i + 1),
      );

      const transcript = formatTranscript(messages);

      // 消息数极多时退化为省略最早的对话，但最近一轮必须保留
      expect(transcript).toContain('较早的对话因长度限制已省略');
      expect(transcript).toContain('候选人（第 200 轮）：');
      expect(transcript).not.toContain('候选人（第 1 轮）：');
    });

    it('should return an empty string for an empty transcript', () => {
      expect(formatTranscript([])).toBe('');
    });
  });
});
