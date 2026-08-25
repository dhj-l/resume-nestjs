import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateInterviewSessionDto,
  LevelConfigDto,
  SubmitAnswerDto,
} from './create-interview-session.dto';
import {
  ExperienceLevelEnum,
  InterviewFocusEnum,
} from '../constants/level.constants';
import { MessageChannelEnum } from '../entities/interview-session.entity';

const validJd = `前端开发工程师（Node.js 方向）
工作地点：上海
公司介绍：某互联网公司，专注于 AI 与数据平台产品研发。
职位描述：
1、负责服务端接口与 BFF 层研发；
2、参与性能优化和架构升级。
任职要求：
1、本科及以上学历；
2、熟悉 Node.js 与数据库设计。
薪资范围：25k-40k。`;

function buildValidDto(): Record<string, any> {
  return {
    resumeId: '507f1f77bcf86cd799439011',
    jobDescription: validJd,
    levelConfig: {
      experienceLevel: ExperienceLevelEnum.Mid,
      focus: InterviewFocusEnum.Technical,
    },
  };
}

describe('CreateInterviewSessionDto', () => {
  it('should accept a valid payload', async () => {
    const dto = plainToInstance(CreateInterviewSessionDto, buildValidDto());
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.levelConfig).toBeInstanceOf(LevelConfigDto);
  });

  it('should reject an invalid experienceLevel enum value', async () => {
    const payload = buildValidDto();
    payload.levelConfig.experienceLevel = 'principal';
    const dto = plainToInstance(CreateInterviewSessionDto, payload);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'levelConfig')).toBe(true);
  });

  it('should reject an invalid focus enum value', async () => {
    const payload = buildValidDto();
    payload.levelConfig.focus = 'salary_negotiation';
    const dto = plainToInstance(CreateInterviewSessionDto, payload);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should reject a non-mongo resumeId', async () => {
    const payload = buildValidDto();
    payload.resumeId = 'not-an-id';
    const dto = plainToInstance(CreateInterviewSessionDto, payload);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'resumeId')).toBe(true);
  });

  it('should reject an overly short jobDescription', async () => {
    const payload = buildValidDto();
    payload.jobDescription = '太短了';
    const dto = plainToInstance(CreateInterviewSessionDto, payload);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'jobDescription')).toBe(true);
  });
});

describe('SubmitAnswerDto', () => {
  it('should accept content with default channel omitted', async () => {
    const dto = plainToInstance(SubmitAnswerDto, {
      content: '我的回答是……',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.channel).toBeUndefined();
  });

  it('should accept voice channel for future extension', async () => {
    const dto = plainToInstance(SubmitAnswerDto, {
      content: '我的回答是……',
      channel: MessageChannelEnum.Voice,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should reject empty content and invalid channel', async () => {
    const dto = plainToInstance(SubmitAnswerDto, {
      content: '',
      channel: 'phone',
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property).sort()).toEqual([
      'channel',
      'content',
    ]);
  });
});
