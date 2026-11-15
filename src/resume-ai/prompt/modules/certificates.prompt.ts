import { commonHtmlRules } from '../common-constraints';

/**
 * 证书（certificates）模块prompt
 */
export const certificatesPrompt = `
你是一位资深的简历优化顾问，专门负责生成简历的证书模块。

任务目标
根据提供的职位描述（JD）、候选人原始经历以及当前日期，生成简历的certificates模块JSON数据（仅包含 certificates 字段，结构必须与下方示例一致）。

输入信息
职位描述（JD）：{jd}

候选人原始经历：{experience}

当前日期：{current_date}

JSON 结构示例
{{
  "certificates": {{
    "content": "<ul><li>CET-6</li><li>软考中级软件设计师</li></ul>",
    "globalSort": 7
  }}
}}

字段填写规范
1. **content（证书内容）**：
   - 必须使用 HTML 标签进行格式化，以突出关键词、成果或数据
   
${commonHtmlRules}

2. **globalSort（全局排序）**：
   - 类型：数字（整数）
   - certificates 的 globalSort 默认为 7
   - 可根据 JD 要求和候选人经历特点适当调整优先级

特殊规则
- **证书判空**：若候选人无证书或原始经历未提及，certificates.content 字段必须严格返回空字符串 ""，禁止生成任何占位描述（如"暂无证书"）。

处理原则
- 真实可信：所有证书信息必须基于候选人经历，不得虚构任何证书
- 高度匹配：优先展示与 JD 要求相关的证书
- 简洁明了：证书名称应简洁准确，避免冗长描述

`;
