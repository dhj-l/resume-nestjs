import { AiService } from 'src/ai/ai.service';
import {
  InterviewOutlineSchema,
  type InterviewOutlineTopic,
} from './interview-outline.schema';
import {
  InterviewQuestionDecisionSchema,
  type InterviewQuestionDecision,
} from './interview-question.schema';
import {
  InterviewReportSchema,
  type InterviewReport,
} from './interview-report.schema';

describe('interview Zod schemas', () => {
  let aiService: AiService;

  beforeEach(() => {
    const config = {
      get: jest.fn().mockReturnValue('low'),
      getOrThrow: jest.fn().mockReturnValue('sk-test'),
    };
    aiService = new AiService(config as any);
  });

  const parseWith = async (schema: any, text: string) => {
    const parser = aiService.createRobustStructuredParser(schema);
    return parser.invoke({ content: text } as any);
  };

  describe('InterviewOutlineSchema', () => {
    it('should parse a valid outline from fenced JSON', async () => {
      const text = `\`\`\`json
{"topics":[{"key":"nodejs_event_loop","title":"Node.js 事件循环","description":"考察对事件循环机制的理解深度","difficulty":"进阶"},{"key":"project_architecture","title":"项目架构设计","description":"","difficulty":"高阶"},{"key":"database_design","title":"数据库设计"}]}
\`\`\``;
      const result = (await parseWith(InterviewOutlineSchema, text)) as {
        topics: InterviewOutlineTopic[];
      };
      expect(result.topics).toHaveLength(3);
      expect(result.topics[0].key).toBe('nodejs_event_loop');
    });

    it('should reject outline with too few topics', async () => {
      await expect(
        parseWith(
          InterviewOutlineSchema,
          '{"topics":[{"key":"a","title":"主题"}]}',
        ),
      ).rejects.toThrow();
    });

    it('should tolerate unknown extra fields via passthrough', async () => {
      const text = `{"topics":[{"key":"a","title":"主题一"},{"key":"b","title":"主题二"},{"key":"c","title":"主题三"}],"extraField":123}`;
      const result = await parseWith(InterviewOutlineSchema, text);
      expect((result as any).extraField).toBe(123);
    });
  });

  describe('InterviewQuestionDecisionSchema', () => {
    it('should parse a valid follow-up decision', async () => {
      const text = `以下是下一题：\n{"topicKey":"project_architecture","question":"你提到做了分库分表，能具体讲讲分片键是如何选择的吗？","isFollowUp":true,"shouldEndInterview":false,"reason":"上一轮回答中分片策略表述模糊"}`;
      const result = (await parseWith(
        InterviewQuestionDecisionSchema,
        text,
      )) as InterviewQuestionDecision;
      expect(result.isFollowUp).toBe(true);
      expect(result.topicKey).toBe('project_architecture');
      expect(result.question.length).toBeGreaterThan(0);
    });

    it('should reject missing question field', async () => {
      await expect(
        parseWith(
          InterviewQuestionDecisionSchema,
          '{"topicKey":"a","isFollowUp":false}',
        ),
      ).rejects.toThrow();
    });
  });

  describe('InterviewReportSchema', () => {
    it('should parse a valid report', async () => {
      const text = `{"overallScore":78,"summary":"整体表现良好，与岗位要求匹配度较高。","recommendation":"推荐","topics":[{"topicKey":"nodejs_event_loop","title":"Node.js 事件循环","score":82,"comment":"原理讲解清晰，缺少实际调优经验。"}],"strengths":["基础扎实"],"weaknesses":["生产调优经验不足"],"suggestions":["深入学习性能剖析工具"]}`;
      const result = (await parseWith(
        InterviewReportSchema,
        text,
      )) as InterviewReport;
      expect(result.overallScore).toBe(78);
      expect(result.topics[0].score).toBe(82);
    });

    it('should reject out-of-range score', async () => {
      await expect(
        parseWith(
          InterviewReportSchema,
          '{"overallScore":150,"summary":"x","topics":[{"topicKey":"a","score":50,"comment":"c"}]}',
        ),
      ).rejects.toThrow();
    });
  });
});
