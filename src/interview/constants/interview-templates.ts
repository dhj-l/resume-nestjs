import { InterviewModeEnum, InterviewStageEnum } from './level.constants';

/**
 * 面试开场自我介绍引导语（按轮次区分面试官人设）
 *
 * 首题不走 AI 生成：自我介绍的开场白高度固定，本地模板渲染
 * 更快更稳定，也节省一次 LLM 调用。
 */
const INTRO_TEMPLATES: Record<InterviewStageEnum, string> = {
  [InterviewStageEnum.First]:
    '你好，欢迎参加今天的面试，我是你一面（基础技术面）的面试官，也是你入职后同组的工程师。在正式开始前，先请你做一个简单的自我介绍，控制在 2 分钟左右，重点讲讲和你应聘岗位相关的项目经历和技术栈。',
  [InterviewStageEnum.Second]:
    '你好，我是今天二面（项目深入面）的面试官，也是这个团队的 Leader，接下来我们会主要围绕你做过的项目聊一聊。先请你做个自我介绍，2 分钟左右，重点介绍你最有代表性的项目和你在其中承担的角色。',
  [InterviewStageEnum.Third]:
    '你好，我是今天三面（综合面）的面试官。前面两位同事应该已经考察过你的技术功底了，这一轮我们聊得更开放一些。先请你做个自我介绍，2 分钟左右，除了项目经历，也可以谈谈你的技术判断和职业规划。',
};

/**
 * 进入反问环节的引导语兜底模板（按轮次区分）
 *
 * 正常情况下由 AI 生成更贴合面试内容的收尾语；
 * 当 AI 未按约定输出收尾语时，用该模板兜底，保证反问环节必然开启。
 */
const REVERSE_INTRO_TEMPLATES: Record<InterviewStageEnum, string> = {
  [InterviewStageEnum.First]:
    '好的，技术问题就先问到这里，你的基础整体不错。今天的面试时间也差不多了，最后留几分钟给你——你有什么想问我的吗？关于团队、技术栈或者日常工作都可以聊。',
  [InterviewStageEnum.Second]:
    '行，项目相关的问题我们就先聊到这里，聊得挺深入的。最后的时间交给你，你有什么想问我的吗？不管是团队的业务方向、技术挑战还是成长路径，都可以问。',
  [InterviewStageEnum.Third]:
    '好，那我们今天的面试环节就基本结束了，聊得比较全面。按照惯例留一点时间给你，你有什么想问我的吗？关于部门的发展方向、团队氛围，或者你个人的发展空间，都可以。',
};

/** 校招模式的措辞微调：更亲和，提示可以讲实习与校园经历 */
const CAMPUS_INTRO_SUFFIX =
  '如果你是应届同学，实习和校园经历也可以简单带一下。';

export function buildIntroQuestion(
  stage: InterviewStageEnum,
  mode: InterviewModeEnum,
): string {
  const base =
    INTRO_TEMPLATES[stage] ?? INTRO_TEMPLATES[InterviewStageEnum.First];
  return mode === InterviewModeEnum.Campus
    ? `${base}${CAMPUS_INTRO_SUFFIX}`
    : base;
}

export function buildReverseIntroTemplate(stage: InterviewStageEnum): string {
  return (
    REVERSE_INTRO_TEMPLATES[stage] ??
    REVERSE_INTRO_TEMPLATES[InterviewStageEnum.First]
  );
}
