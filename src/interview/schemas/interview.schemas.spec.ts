import { AiService } from 'src/ai/ai.service';
import {
  InterviewOutlineSchema,
  type InterviewOutlineTopic,
} from './interview-outline.schema';
import {
  InterviewTurnDecisionSchema,
  type InterviewTurnDecision,
} from './interview-question.schema';
import {
  InterviewReverseResponseSchema,
  type InterviewReverseResponse,
} from './interview-reverse.schema';
import {
  InterviewReverseSuggestionsSchema,
  type InterviewReverseSuggestion,
} from './interview-reverse-suggestions.schema';
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
    it('should parse a valid outline with questionType from fenced JSON', async () => {
      const text = `\`\`\`json
{"topics":[{"key":"self_intro","title":"自我介绍","questionType":"self_intro"},{"key":"order_system_refactor","title":"订单系统重构","questionType":"project"},{"key":"tcp_handshake","title":"TCP 三次握手","questionType":"fundamentals"},{"key":"seckill_design","title":"秒杀系统设计","questionType":"system_design"}]}
\`\`\``;
      const result = (await parseWith(InterviewOutlineSchema, text)) as {
        topics: InterviewOutlineTopic[];
      };
      expect(result.topics).toHaveLength(4);
      expect(result.topics[0].questionType).toBe('self_intro');
      expect(result.topics[1].questionType).toBe('project');
    });

    it('should parse outline without questionType (engine normalizes later)', async () => {
      const text = `{"topics":[{"key":"a","title":"主题一"},{"key":"b","title":"主题二"},{"key":"c","title":"主题三"}]}`;
      const result = (await parseWith(InterviewOutlineSchema, text)) as {
        topics: InterviewOutlineTopic[];
      };
      expect(result.topics[0].questionType).toBeUndefined();
    });

    it('should reject outline with too few topics', async () => {
      await expect(
        parseWith(
          InterviewOutlineSchema,
          '{"topics":[{"key":"a","title":"主题"}]}',
        ),
      ).rejects.toThrow();
    });

    it('should reject unknown questionType value', async () => {
      await expect(
        parseWith(
          InterviewOutlineSchema,
          '{"topics":[{"key":"a","title":"主题一","questionType":"coding"},{"key":"b","title":"主题二"},{"key":"c","title":"主题三"}]}',
        ),
      ).rejects.toThrow();
    });

    it('should tolerate unknown extra fields via passthrough', async () => {
      const text = `{"topics":[{"key":"a","title":"主题一"},{"key":"b","title":"主题二"},{"key":"c","title":"主题三"}],"extraField":123}`;
      const result = await parseWith(InterviewOutlineSchema, text);
      expect((result as any).extraField).toBe(123);
    });
  });

  describe('InterviewTurnDecisionSchema', () => {
    it('should parse a valid turn decision with feedback', async () => {
      const text = `决策如下：\n{"feedback":{"completeness":70,"logic":85,"depth":60,"comment":"分片键选择讲清楚了，但没提到扩容方案"},"topicKey":"order_system_refactor","question":"那如果数据量再涨十倍，你现在的分片方案要怎么平滑扩容？","questionType":"project","isFollowUp":true,"shouldEndMainPhase":false,"reason":"继续深挖扩容场景"}`;
      const result = (await parseWith(
        InterviewTurnDecisionSchema,
        text,
      )) as InterviewTurnDecision;
      expect(result.feedback.completeness).toBe(70);
      expect(result.feedback.logic).toBe(85);
      expect(result.isFollowUp).toBe(true);
      expect(result.question.length).toBeGreaterThan(0);
    });

    it('should parse a transition decision into reverse phase', async () => {
      const text = `{"feedback":{"completeness":80,"logic":80,"depth":75,"comment":"回答完整"},"topicKey":"adhoc_summary","question":"今天聊得不错，你有什么想问我的吗？","questionType":"reverse","shouldEndMainPhase":true}`;
      const result = (await parseWith(
        InterviewTurnDecisionSchema,
        text,
      )) as InterviewTurnDecision;
      expect(result.shouldEndMainPhase).toBe(true);
      expect(result.questionType).toBe('reverse');
    });

    it('should normalize an empty topicKey to undefined on closing transitions', async () => {
      // 生产实测：模型输出收尾语时经常携带空字符串 topicKey 而非省略字段，
      // 空串应归一为 undefined，而不是让整个回合决策解析失败
      const text = `{"feedback":{"completeness":70,"logic":75,"depth":65,"comment":"整体基础扎实"},"topicKey":"","question":"今天交流下来你很有亮点，最后留几分钟给你，你有什么想问我的吗？","questionType":"reverse","isFollowUp":false,"shouldEndMainPhase":true}`;
      const result = (await parseWith(
        InterviewTurnDecisionSchema,
        text,
      )) as InterviewTurnDecision;
      expect(result.topicKey).toBeUndefined();
      expect(result.shouldEndMainPhase).toBe(true);
    });

    it('should reject missing feedback', async () => {
      await expect(
        parseWith(
          InterviewTurnDecisionSchema,
          '{"topicKey":"a","question":"下一题？","isFollowUp":false}',
        ),
      ).rejects.toThrow();
    });

    it('should reject out-of-range feedback score', async () => {
      await expect(
        parseWith(
          InterviewTurnDecisionSchema,
          '{"feedback":{"completeness":120,"logic":80,"depth":60,"comment":"x"},"question":"下一题？"}',
        ),
      ).rejects.toThrow();
    });
  });

  describe('InterviewReverseResponseSchema', () => {
    it('should parse a valid reverse response', async () => {
      const text = `{"response":"团队目前 12 个人，前后端都有专门的子方向。你还有什么想了解的吗？","continueReverse":true,"reason":"候选人正常反问"}`;
      const result = (await parseWith(
        InterviewReverseResponseSchema,
        text,
      )) as InterviewReverseResponse;
      expect(result.continueReverse).toBe(true);
      expect(result.response).toContain('团队');
    });

    it('should reject missing response', async () => {
      await expect(
        parseWith(InterviewReverseResponseSchema, '{"continueReverse":true}'),
      ).rejects.toThrow();
    });
  });

  describe('InterviewReverseSuggestionsSchema', () => {
    it('should parse valid suggestions', async () => {
      const text = `{"suggestions":[{"title":"团队技术栈演进","content":"想了解一下团队现在核心的技术栈是什么，未来一年有什么演进方向？","rationale":"贴合二面 Leader 视角，展现技术热情"},{"title":"新人成长机制","content":"团队对新人的培养机制大概是怎样的？","rationale":"一面适合问"},{"title":"业务挑战","content":"这个业务目前最大的技术挑战是什么？","rationale":"顺势追问面试内容"}]}`;
      const result = (await parseWith(
        InterviewReverseSuggestionsSchema,
        text,
      )) as { suggestions: InterviewReverseSuggestion[] };
      expect(result.suggestions).toHaveLength(3);
      expect(result.suggestions[0].content).toContain('技术栈');
    });

    it('should reject fewer than 3 suggestions', async () => {
      await expect(
        parseWith(
          InterviewReverseSuggestionsSchema,
          '{"suggestions":[{"title":"a","content":"b"}]}',
        ),
      ).rejects.toThrow();
    });
  });

  describe('InterviewReportSchema', () => {
    it('should parse a valid report with dimension scores and reverse feedback', async () => {
      const text = `{"overallScore":78,"summary":"整体表现良好。","recommendation":"推荐","dimensionScores":{"completeness":75,"logic":80,"depth":70},"topics":[{"topicKey":"order_system_refactor","title":"订单系统重构","score":82,"comment":"原理清晰。"}],"reverseFeedback":{"score":85,"comment":"反问有思考深度。"},"strengths":["基础扎实"],"weaknesses":["生产调优经验不足"],"suggestions":["深入学习性能剖析工具"]}`;
      const result = (await parseWith(
        InterviewReportSchema,
        text,
      )) as InterviewReport;
      expect(result.overallScore).toBe(78);
      expect(result.dimensionScores?.logic).toBe(80);
      expect(result.reverseFeedback?.score).toBe(85);
    });

    it('should parse legacy report without new optional fields', async () => {
      const text = `{"overallScore":60,"summary":"一般。","topics":[{"topicKey":"a","score":60,"comment":"c"}]}`;
      const result = (await parseWith(
        InterviewReportSchema,
        text,
      )) as InterviewReport;
      expect(result.dimensionScores).toBeUndefined();
      expect(result.reverseFeedback).toBeUndefined();
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
