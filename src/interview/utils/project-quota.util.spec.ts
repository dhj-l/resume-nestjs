import { InterviewModeEnum } from '../constants/level.constants';
import {
  allocateProjectQuotas,
  buildProjectDeepDiveQuota,
  buildProjectQuotaFallback,
  parseProjectTimeKey,
} from './project-quota.util';

/** 构造一条可深挖经历的便捷工具 */
const p = (name: string, startTime?: string, endTime?: string) => ({
  name,
  startTime,
  endTime,
});

const currentYearMonthKey = () => {
  const now = new Date();
  return now.getFullYear() * 100 + (now.getMonth() + 1);
};

describe('parseProjectTimeKey', () => {
  it('should prefer a parseable endTime over startTime', () => {
    expect(parseProjectTimeKey('2024-01', '2024-06')).toBe(202406);
  });

  it('should fall back to startTime when endTime is unparseable', () => {
    expect(parseProjectTimeKey('2023-01', '时间不确定')).toBe(202301);
  });

  it('should use startTime when endTime is empty', () => {
    expect(parseProjectTimeKey('2024-01', '')).toBe(202401);
  });

  it('should treat 至今 as the current month', () => {
    expect(parseProjectTimeKey('2024-01', '至今')).toBe(currentYearMonthKey());
    expect(parseProjectTimeKey(undefined, '至今')).toBe(currentYearMonthKey());
  });

  it('should tolerate year-only, Chinese and dotted formats', () => {
    expect(parseProjectTimeKey('2024', undefined)).toBe(202401);
    expect(parseProjectTimeKey('2024年6月', undefined)).toBe(202406);
    expect(parseProjectTimeKey('2024.6', undefined)).toBe(202406);
  });

  it('should return null when neither time can be parsed', () => {
    expect(parseProjectTimeKey('', 'abc')).toBeNull();
    expect(parseProjectTimeKey(undefined, undefined)).toBeNull();
  });
});

describe('allocateProjectQuotas', () => {
  it('should return an empty list for no projects or non-positive totals', () => {
    expect(allocateProjectQuotas([], 10)).toEqual([]);
    expect(allocateProjectQuotas([p('A', '2024-01')], 0)).toEqual([]);
  });

  it('should give all topics to a single project', () => {
    const entries = allocateProjectQuotas([p('A', '2024-01', '至今')], 10);
    expect(entries.map((e) => e.quota)).toEqual([10]);
  });

  it('should assign 50% to the newest project and split the rest in time order', () => {
    const entries = allocateProjectQuotas(
      [
        p('旧项目', '2021-01', '2021-12'),
        p('新项目', '2024-06', '至今'),
        p('中项目', '2023-01', '2023-12'),
      ],
      10,
    );
    // 新项目独占 5 成；中/旧平分剩余 5 成（2.5 各 → largest remainder 3/2）
    expect(entries.map((e) => e.name)).toEqual(['新项目', '中项目', '旧项目']);
    expect(entries.map((e) => e.quota)).toEqual([5, 3, 2]);
  });

  it('should split the 50% evenly between projects tied for newest', () => {
    const entries = allocateProjectQuotas(
      [
        p('并列A', '2023-01', '2024-06'),
        p('旧项目', '2021-01', '2021-12'),
        p('并列B', '2023-06', '2024-06'),
      ],
      10,
    );
    // 两个并列最近的项目平分 5 成（3/2），旧项目独占剩余 5 成
    expect(entries.map((e) => e.name)).toEqual(['并列A', '并列B', '旧项目']);
    expect(entries.map((e) => e.quota)).toEqual([3, 2, 5]);
  });

  it('should merge the remaining 50% back when only tied-newest projects exist', () => {
    expect(
      allocateProjectQuotas(
        [p('并列A', '2023-01', '2024-06'), p('并列B', '2023-06', '2024-06')],
        10,
      ).map((e) => e.quota),
    ).toEqual([5, 5]);
    expect(
      allocateProjectQuotas(
        [
          p('并列A', '2023-01', '2024-06'),
          p('并列B', '2023-06', '2024-06'),
          p('并列C', '2022-01', '2024-06'),
        ],
        10,
      ).map((e) => e.quota),
    ).toEqual([4, 3, 3]);
  });

  it('should assign untimed projects last while keeping resume order', () => {
    const entries = allocateProjectQuotas(
      [
        p('新项目', '2024-06', '至今'),
        p('无时间项目'),
        p('中项目', '2023-01', '2023-12'),
        p('旧项目', '2021-01', '2021-12'),
      ],
      10,
    );
    // 无时间的排在所有有时间项目之后（保持简历顺序），
    // 剩余 5 成由中/旧/无时间三者平分 → 2/2/1
    expect(entries.map((e) => e.name)).toEqual([
      '新项目',
      '中项目',
      '旧项目',
      '无时间项目',
    ]);
    expect(entries.map((e) => e.quota)).toEqual([5, 2, 2, 1]);
  });

  it('should fall back to resume order when no project has a time', () => {
    const entries = allocateProjectQuotas(
      [p('第一个'), p('第二个'), p('第三个')],
      10,
    );
    expect(entries.map((e) => e.name)).toEqual(['第一个', '第二个', '第三个']);
    expect(entries.map((e) => e.quota)).toEqual([5, 3, 2]);
    expect(entries.every((e) => e.noTime)).toBe(true);
  });

  it('should mark untimed entries with noTime', () => {
    const entries = allocateProjectQuotas([p('A', '2024-01'), p('B')], 10);
    expect(entries.map((e) => e.noTime)).toEqual([false, true]);
  });

  it('should drop quotas to zero when projects outnumber topics', () => {
    const inputs = Array.from({ length: 12 }, (_, i) =>
      p(
        `项目${i + 1}`,
        `2024-01`,
        `2024-${String((i % 12) + 1).padStart(2, '0')}`,
      ),
    );
    const entries = allocateProjectQuotas(inputs, 10);
    expect(entries.map((e) => e.quota)).toEqual([
      5, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0,
    ]);
  });
});

describe('buildProjectDeepDiveQuota - 收集范围随面试模式', () => {
  /** 同时含工作/项目/实习的简历，用于断言各模式只收集对应范围 */
  const fullResume = {
    workExperience: [
      {
        companyName: '阿里云',
        position: '后端工程师',
        workTime: '2022-03',
        dismissalTime: '至今',
      },
    ],
    projectExperience: [
      { title: '订单中台', startTime: '2024-06', endTime: '2025-06' },
      { title: '老项目', startTime: '2021-01', endTime: '2021-12' },
    ],
    internshipExperience: [
      {
        companyName: '字节跳动',
        position: '后端实习',
        startTime: '2023-01',
        endTime: '2023-06',
      },
    ],
  };

  it('should collect projects and internships in campus mode', () => {
    const text = buildProjectDeepDiveQuota(
      fullResume,
      10,
      InterviewModeEnum.Campus,
    );
    expect(text).toContain('「订单中台」（2024-06 ~ 2025-06）');
    expect(text).toContain('「字节跳动·后端实习」');
    expect(text).not.toContain('阿里云');
  });

  it('should collect work and projects in experienced mode', () => {
    const text = buildProjectDeepDiveQuota(
      fullResume,
      10,
      InterviewModeEnum.Experienced,
    );
    // 工作经历读 workTime/dismissalTime，离职「至今」视为最新 → 占 5 成；
    // 订单中台（2025-06）比老项目（2021-12）新 → 平分剩余 5 成拿 3
    expect(text).toContain(
      '「阿里云·后端工程师」（2022-03 至今）：约 5 个主题',
    );
    expect(text).toContain('「订单中台」（2024-06 ~ 2025-06）：约 3 个主题');
    expect(text).toContain('「老项目」');
    expect(text).not.toContain('字节跳动');
  });

  it('should default to the campus scope when mode is omitted', () => {
    const text = buildProjectDeepDiveQuota(fullResume, 10);
    expect(text).toContain('「字节跳动·后端实习」');
    expect(text).not.toContain('阿里云');
  });
});

describe('buildProjectQuotaFallback', () => {
  it('should mention the mode-specific deep-dive scope', () => {
    expect(buildProjectQuotaFallback(InterviewModeEnum.Campus)).toContain(
      '项目/实习经历',
    );
    expect(buildProjectQuotaFallback(InterviewModeEnum.Experienced)).toContain(
      '项目/工作经历',
    );
  });
});

describe('buildProjectDeepDiveQuota', () => {
  it('should return an empty string when the resume has no deep-dive experience', () => {
    expect(buildProjectDeepDiveQuota(null, 10)).toBe('');
    expect(buildProjectDeepDiveQuota(undefined, 10)).toBe('');
    expect(buildProjectDeepDiveQuota({}, 10)).toBe('');
  });

  it('should render project and internship quotas with names and times', () => {
    const text = buildProjectDeepDiveQuota(
      {
        projectExperience: [
          { title: '订单中台', startTime: '2024-06', endTime: '至今' },
        ],
        internshipExperience: [
          {
            companyName: '字节跳动',
            position: '后端实习',
            startTime: '2023-01',
            endTime: '2023-06',
          },
        ],
      },
      10,
    );
    // 最近的项目占 5 成；实习独占剩余 5 成
    expect(text).toContain('「订单中台」（2024-06 至今）：约 5 个主题');
    expect(text).toContain(
      '「字节跳动·后端实习」（2023-01 ~ 2023-06）：约 5 个主题',
    );
  });

  it('should annotate untimed projects and zero-quota projects', () => {
    const text = buildProjectDeepDiveQuota(
      {
        projectExperience: [
          { title: '新项目', startTime: '2024-06', endTime: '至今' },
          { title: '无时间项目' },
          { title: '旧项目A', startTime: '2021-01', endTime: '2021-06' },
          { title: '旧项目B', startTime: '2020-01', endTime: '2020-06' },
        ],
      },
      4,
    );
    // 4 主题：新项目占 5 成 = 2；旧A/旧B/无时间 平分 2 → 1/1/0
    expect(text).toContain('「新项目」（2024-06 至今）：约 2 个主题');
    expect(text).toContain('「旧项目A」（2021-01 ~ 2021-06）：约 1 个主题');
    expect(text).toContain(
      '「无时间项目」（时间未填写）：不单独安排主题，可作为追问素材（按简历顺序，深挖优先级最低）',
    );
  });

  it('should annotate a positive quota for an untimed project', () => {
    const text = buildProjectDeepDiveQuota(
      {
        projectExperience: [
          { title: '新项目', startTime: '2024-06', endTime: '至今' },
          { title: '无时间项目' },
        ],
      },
      5,
    );
    // 5 主题：新项目占 5 成 ≈ 3；无时间项目拿剩余 2
    expect(text).toContain(
      '「无时间项目」（时间未填写）：约 2 个主题（按简历顺序，深挖优先级最低）',
    );
  });
});
