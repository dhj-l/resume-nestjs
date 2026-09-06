import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetResumeDto } from './get-resume.dto';

describe('GetResumeDto', () => {
  const validateDto = (obj: Record<string, unknown>) =>
    validate(plainToInstance(GetResumeDto, obj));

  it('合法数字 page/pageSize 通过校验', async () => {
    const errors = await validateDto({ page: 1, pageSize: 10 });
    expect(errors).toHaveLength(0);
  });

  it('数字字符串会被 @Type 转换为数字并通过', async () => {
    const errors = await validateDto({ page: '2', pageSize: '6' });
    expect(errors).toHaveLength(0);
  });

  it('非数字 page 被拒绝（修复：?page=abc 不再透传 NaN 触发 500）', async () => {
    const errors = await validateDto({ page: 'abc' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('page');
  });

  it('page < 1 被拒绝', async () => {
    const errors = await validateDto({ page: 0 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('page');
  });

  it('小数 page 被拒绝（避免非整数 skip 触发 500）', async () => {
    const errors = await validateDto({ page: 1.5 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('page');
  });

  it('pageSize > 100 被拒绝', async () => {
    const errors = await validateDto({ pageSize: 101 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('pageSize');
  });

  it('小数 pageSize 被拒绝', async () => {
    const errors = await validateDto({ pageSize: 1.5 });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('pageSize');
  });
});
