import type { InterviewMessage } from '../entities/interview-session.entity';
import { MessageRoleEnum } from '../entities/interview-session.entity';

/**
 * 注入提示词实时区的最近对话条数上限
 *
 * 出题/反问/反问建议三条链共用（都只需要最近上下文）。
 */
export const HISTORY_MESSAGE_LIMIT = 10;

/** 报告转录单条消息的字数上限（不足时按预算整体收缩） */
export const TRANSCRIPT_MESSAGE_MAX = 1500;

/** 报告转录单条消息的字数下限（避免消息数极多时逐条被压成残句） */
export const TRANSCRIPT_MESSAGE_MIN = 300;

/** 报告转录总字数预算（主预算，按消息数摊到每条） */
export const TRANSCRIPT_BUDGET = 24000;

/** 每条转录行的固定开销（说话人、轮次、题型标注与段落分隔） */
const TRANSCRIPT_LINE_OVERHEAD = 32;

const TRUNCATION_NOTICE = '……（内容过长已截断）';
const OMITTED_NOTICE = '（较早的对话因长度限制已省略）';

/** 消息角色 → 转录中的说话人标注（出题提示词与评价报告共用） */
export function speakerLabel(role: MessageRoleEnum): string {
  return role === MessageRoleEnum.Interviewer ? '面试官' : '候选人';
}

/** 单条消息的说话人行（带角色标注） */
export function formatSpeakerLine(message: InterviewMessage): string {
  return `${speakerLabel(message.role)}：${message.content}`;
}

/**
 * 提示词实时区的最近对话（按时间正序逐行标注角色，输出与历史版本逐字一致）
 */
export function formatConversationHistory(
  messages: InterviewMessage[],
): string {
  return (messages ?? [])
    .slice(-HISTORY_MESSAGE_LIMIT)
    .map((message) => formatSpeakerLine(message))
    .join('\n');
}

/**
 * 报告用的完整转录（逐轮标注说话人、轮次与题型）
 *
 * 题型标注供报告提示词中的两条规则判定：`questionType=reverse` 的候选人
 * 消息标识反问环节是否发生（决定 reverseFeedback 是否输出）、
 * `questionType=project` 标识项目主线主题（决定评分权重）。
 *
 * 输入预算：对话转录是报告最长的一段输入（长面试可达数万字符），
 * 这里按「消息数摊总预算」逐条收缩，保证每一轮对话都保留（报告要覆盖
 * 全部考察主题），消息数极多时再退化为从最早的对话开始省略。
 */
export function formatTranscript(messages: InterviewMessage[]): string {
  if (!messages?.length) {
    return '';
  }
  // 每条分配「预算/消息数」，再扣除行标注开销，保证逐条收缩后总量落在预算内
  const perMessageMax = Math.min(
    TRANSCRIPT_MESSAGE_MAX,
    Math.max(
      TRANSCRIPT_MESSAGE_MIN,
      Math.floor(TRANSCRIPT_BUDGET / messages.length) -
        TRANSCRIPT_LINE_OVERHEAD,
    ),
  );
  const lines = messages.map((message) =>
    buildTranscriptLine(message, perMessageMax),
  );

  const kept: string[] = [];
  let used = 0;
  for (let index = lines.length - 1; index >= 0; index--) {
    const cost = lines[index].length + 2;
    if (kept.length > 0 && used + cost > TRANSCRIPT_BUDGET) {
      break;
    }
    used += cost;
    kept.push(lines[index]);
  }
  kept.reverse();

  const omitted = kept.length < lines.length;
  return (omitted ? `${OMITTED_NOTICE}\n\n` : '') + kept.join('\n\n');
}

function buildTranscriptLine(
  message: InterviewMessage,
  perMessageMax: number,
): string {
  // 题型为枚举英文值，与报告提示词中的 questionType 写法一致
  const typeTag = message.questionType ? `·${message.questionType}` : '';
  return `${speakerLabel(message.role)}（第 ${message.round} 轮${typeTag}）：${truncateContent(
    message.content,
    perMessageMax,
  )}`;
}

function truncateContent(content: string, max: number): string {
  if (content.length <= max) {
    return content;
  }
  return `${content.slice(0, Math.max(0, max - TRUNCATION_NOTICE.length))}${TRUNCATION_NOTICE}`;
}
