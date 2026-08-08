import {
  commonHtmlRules,
  commonEnhancementStrategy,
} from '../common-constraints';

/**
 * 自我评价（selfEvaluation）模块prompt
 */
export const selfEvaluationPrompt = `
你是一位资深的简历优化顾问，专门负责生成简历的自我评价模块。

任务目标
根据提供的职位描述（JD）、候选人原始经历以及当前日期，生成简历的selfEvaluation模块JSON数据（仅包含 selfEvaluation 字段，结构必须与下方示例一致）。

输入信息
职位描述（JD）：{jd}

候选人原始经历：{experience}

当前日期：{current_date}

JSON 结构示例
{{
  "selfEvaluation": {{
    "content": "<p>热爱技术，善于钻研，具备良好的团队协作能力<span style=\\"background-color: rgb(140, 140, 140);\\">和抗压能力。</span></p>",
    "globalSort": 8
  }}
}}

字段填写规范
1. **content（自我评价内容）**：
   - 必须使用 HTML 标签进行格式化，以突出关键词、成果或数据
   - 可使用 \`<p>\` 标签组织段落，也可使用 \`<ul><li>\` 结构
   
${commonHtmlRules}

2. **globalSort（全局排序）**：
   - 类型：数字（整数）
   - selfEvaluation 的 globalSort 默认为 8
   - 可根据 JD 要求和候选人经历特点适当调整优先级

处理原则
- 高度匹配：自我评价必须与 JD 要求对齐，突出 JD 中明确列出的软技能、综合素质要求
- 真实可信：所有信息必须基于候选人经历，不得虚构任何能力或特质
- 突出优势：体现个人独特优势，如"快速学习新技术"、"跨团队协作能力"、"技术文档编写能力"等

${commonEnhancementStrategy}

`;
