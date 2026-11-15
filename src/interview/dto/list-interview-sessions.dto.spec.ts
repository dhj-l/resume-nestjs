import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListInterviewSessionsDto } from './list-interview-sessions.dto';
import { InterviewStatusEnum } from '../constants/level.constants';

describe('ListInterviewSessionsDto', () => {
  it('should accept an empty query and keep page/pageSize undefined', async () => {
    const dto = plainToInstance(ListInterviewSessionsDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBeUndefined();
    expect(dto.pageSize).toBeUndefined();
    expect(dto.status).toBeUndefined();
  });

  it('should transform and accept valid pagination query', async () => {
    const dto = plainToInstance(ListInterviewSessionsDto, {
      page: '2',
      pageSize: '20',
      status: InterviewStatusEnum.Completed,
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.pageSize).toBe(20);
  });

  it('should reject a non-positive page', async () => {
    const dto = plainToInstance(ListInterviewSessionsDto, { page: '0' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'page')).toBe(true);
  });

  it('should reject a pageSize above the upper bound', async () => {
    const dto = plainToInstance(ListInterviewSessionsDto, { pageSize: '51' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'pageSize')).toBe(true);
  });

  it('should reject an invalid status enum value', async () => {
    const dto = plainToInstance(ListInterviewSessionsDto, {
      status: 'archived',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'status')).toBe(true);
  });
});
