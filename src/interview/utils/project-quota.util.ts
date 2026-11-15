/**
 * 项目深挖主题配额分配
 *
 * 大纲规划阶段按「经历时间从近到远」为各经历分配深挖主题配额：
 * 时间最近的经历占深挖主题总数约 5 成（并列最近则平分这 5 成），
 * 其余经历按时间从新到旧平分剩余 5 成；未填写时间的经历排在最后、
 * 彼此按简历顺序分配。
 *
 * 收集范围随面试模式变化：校招（默认）取项目+实习经历，社招取
 * 工作+项目经历——校招候选人通常没有工作经历，社招候选人的工作
 * 经历才是主要深挖素材（其时间字段为 workTime/dismissalTime）。
 *
 * 配额在代码层计算后注入大纲提示词——LLM 执行「按百分比数数」类规则
 * 不可靠且无法测试，代码分配可确定性单测。
 */

import { InterviewModeEnum } from '../constants/level.constants';

/** 参与配额分配的一条经历（项目或实习）归一化输入 */
export interface DeepDiveProjectInput {
  /** 展示用名称（项目名 / 公司·职位） */
  name: string;
  startTime?: string;
  endTime?: string;
}

/** 一条经历分配到的深挖主题配额 */
export interface ProjectQuotaEntry {
  name: string;
  /** 渲染用时间段文本（缺失时为「时间未填写」） */
  timeText: string;
  /** 未填写任何可解析时间（按简历顺序排在最后） */
  noTime: boolean;
  /** 分配到的深挖主题数（可为 0） */
  quota: number;
}

/** 「进行中」时间字样（endTime 为这些值时视为当前时间，即最新） */
const UNTIL_NOW_PATTERN = /至今|现在|目前|present|now|current/i;

/**
 * 宽容的时间解析：简历时间以「YYYY-MM」为主（AI 生成），但手填可能
 * 是「2024」「2024.6」「2024年6月」等；解析失败降级为无时间而非报错。
 * 只取年份时月份按 1 计（仅用于相对排序，不用于展示）。
 */
const TIME_PATTERN = /(\d{4})(?:\s*[-/.年]\s*(\d{1,2}))?/;

/**
 * 解析一段经历的排序键（YYYYMM 数值，越大越新）。
 *
 * 优先取 endTime（「至今」视为当前月份）；endTime 无法解析时回退
 * startTime；两者都解析不出返回 null。
 */
export function parseProjectTimeKey(
  startTime?: string,
  endTime?: string,
): number | null {
  const now = new Date();
  const nowKey = now.getFullYear() * 100 + (now.getMonth() + 1);

  const end = (endTime ?? '').trim();
  if (end) {
    if (UNTIL_NOW_PATTERN.test(end)) {
      return nowKey;
    }
    const parsed = parseTimeText(end);
    if (parsed !== null) {
      return parsed;
    }
  }

  const start = (startTime ?? '').trim();
  if (start) {
    return UNTIL_NOW_PATTERN.test(start) ? nowKey : parseTimeText(start);
  }
  return null;
}

function parseTimeText(text: string): number | null {
  const match = TIME_PATTERN.exec(text);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = match[2] ? Math.min(Math.max(Number(match[2]), 1), 12) : 1;
  return year * 100 + month;
}

/**
 * 按时间从近到远分配各经历的深挖主题配额（总和等于 totalTopics）。
 *
 * - 最近档（排序键最大，可能并列多条）合计占 50%，并列时档内平分；
 * - 其余经历平分剩余 50%（largest remainder 法凑整，越新越多拿余数）；
 * - 不存在其余经历时（如仅两条并列最近的经历），剩余 50% 并回最近档平分；
 * - 无时间的经历排在所有有时间经历之后、彼此保持简历顺序；全部无时间时
 *   退化为按简历顺序分配（第一条占 5 成）；
 * - 经历数多于主题数时，靠后的经历配额为 0（渲染时标注仅作追问素材）。
 */
export function allocateProjectQuotas(
  inputs: DeepDiveProjectInput[],
  totalTopics: number,
): ProjectQuotaEntry[] {
  if (!inputs.length || !Number.isFinite(totalTopics) || totalTopics <= 0) {
    return [];
  }

  const decorated = inputs.map((input, sourceOrder) => ({
    ...input,
    sourceOrder,
    timeKey: parseProjectTimeKey(input.startTime, input.endTime),
  }));

  // 时间从新到旧；无时间排最后；同键/无时间组内保持简历原顺序（稳定排序）
  const sorted = [...decorated].sort((a, b) => {
    const aKey = a.timeKey;
    const bKey = b.timeKey;
    if ((aKey === null) !== (bKey === null)) {
      return aKey === null ? 1 : -1;
    }
    if (aKey !== null && bKey !== null && aKey !== bKey) {
      return bKey - aKey;
    }
    return a.sourceOrder - b.sourceOrder;
  });

  const hasTimedFirst = sorted[0].timeKey !== null;
  const latestEnd = hasTimedFirst
    ? sorted.findIndex((item) => item.timeKey !== sorted[0].timeKey)
    : 1;
  const latestGroup = sorted.slice(
    0,
    latestEnd === -1 ? sorted.length : latestEnd,
  );
  const restGroup = sorted.slice(latestGroup.length);

  const latestQuota = restGroup.length
    ? Math.round(totalTopics * 0.5)
    : totalTopics;
  const latestSplit = splitEvenly(latestGroup.length, latestQuota);
  const restSplit = splitEvenly(restGroup.length, totalTopics - latestQuota);

  return [...latestGroup, ...restGroup].map((item, index) => {
    const inLatest = index < latestGroup.length;
    const quota = inLatest
      ? latestSplit[index]
      : restSplit[index - latestGroup.length];
    return {
      name: item.name,
      timeText: formatTimeRange(item),
      noTime: item.timeKey === null,
      quota,
    };
  });
}

/** 把 total 尽量均匀分成 count 份（largest remainder：靠前的份多拿余数） */
function splitEvenly(count: number, total: number): number[] {
  if (count <= 0) {
    return [];
  }
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from(
    { length: count },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

function formatTimeRange(item: {
  startTime?: string;
  endTime?: string;
  timeKey: number | null;
}): string {
  if (item.timeKey === null) {
    return '时间未填写';
  }
  const start = (item.startTime ?? '').trim();
  const end = (item.endTime ?? '').trim();
  if (start && end) {
    return UNTIL_NOW_PATTERN.test(end)
      ? `${start} ${end}`
      : `${start} ~ ${end}`;
  }
  return start || end || '时间未填写';
}

/**
 * 从简历收集参与深挖配额分配的经历并渲染成提示词文本块。
 *
 * 收集范围随 mode 变化（见文件头注释）；简历缺失对应经历时返回
 * 空串（由调用方注入 buildProjectQuotaFallback 的兜底文案）。
 */
export function buildProjectDeepDiveQuota(
  resume: Record<string, any> | null | undefined,
  totalTopics: number,
  mode?: InterviewModeEnum,
): string {
  const entries = allocateProjectQuotas(
    collectDeepDiveProjects(resume, mode),
    totalTopics,
  );
  return entries.map(renderQuotaEntry).join('\n');
}

/** 简历无可解析经历时的兜底提示词文案，措辞与收集范围同源 */
export function buildProjectQuotaFallback(mode?: InterviewModeEnum): string {
  return mode === InterviewModeEnum.Experienced
    ? '（候选人未提供可解析的项目/工作经历，项目深挖主题请基于 JD 与简历其余内容规划）'
    : '（候选人未提供可解析的项目/实习经历，项目深挖主题请基于 JD 与简历其余内容规划）';
}

function collectDeepDiveProjects(
  resume: Record<string, any> | null | undefined,
  mode?: InterviewModeEnum,
): DeepDiveProjectInput[] {
  if (!resume || typeof resume !== 'object') {
    return [];
  }
  const projects = collectProjectInputs(resume);
  // 收集顺序与简历模块顺序（globalSort）一致：社招工作(1)在项目(2)前，
  // 校招项目(2)在实习(4)前——并列时间/无时间时按此顺序兜底
  if (mode === InterviewModeEnum.Experienced) {
    return [
      ...collectRoleInputs(
        resume,
        'workExperience',
        'workTime',
        'dismissalTime',
        '工作经历',
      ),
      ...projects,
    ];
  }
  return [
    ...projects,
    ...collectRoleInputs(
      resume,
      'internshipExperience',
      'startTime',
      'endTime',
      '实习经历',
    ),
  ];
}

function collectProjectInputs(
  resume: Record<string, any>,
): DeepDiveProjectInput[] {
  const items = Array.isArray(resume.projectExperience)
    ? resume.projectExperience
    : [];
  const inputs: DeepDiveProjectInput[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    inputs.push({
      name: title || '未命名项目',
      startTime: item.startTime,
      endTime: item.endTime,
    });
  }
  return inputs;
}

/** 工作/实习类经历共用收集：公司·职位命名，时间字段名由调用方指定 */
function collectRoleInputs(
  resume: Record<string, any>,
  arrayField: string,
  startTimeField: string,
  endTimeField: string,
  fallbackName: string,
): DeepDiveProjectInput[] {
  const items = Array.isArray(resume[arrayField]) ? resume[arrayField] : [];
  const inputs: DeepDiveProjectInput[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const company =
      typeof item.companyName === 'string' ? item.companyName.trim() : '';
    const position =
      typeof item.position === 'string' ? item.position.trim() : '';
    inputs.push({
      name: [company, position].filter(Boolean).join('·') || fallbackName,
      startTime: item[startTimeField],
      endTime: item[endTimeField],
    });
  }
  return inputs;
}

function renderQuotaEntry(entry: ProjectQuotaEntry, index: number): string {
  const assignment =
    entry.quota > 0
      ? `约 ${entry.quota} 个主题`
      : '不单独安排主题，可作为追问素材';
  const timeNote = entry.noTime ? '（按简历顺序，深挖优先级最低）' : '';
  return `${index + 1}. 「${entry.name}」（${entry.timeText}）：${assignment}${timeNote}`;
}
