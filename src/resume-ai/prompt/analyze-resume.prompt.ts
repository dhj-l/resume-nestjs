export const analyzeResumePrompt = `你是一位资深的HR顾问和简历分析专家。请根据以下简历内容和目标岗位JD，对简历进行多维度的匹配度分析。

## 目标岗位JD
{jd}

## 简历内容
{experience}

## 分析日期
{current_date}

## 输出要求
请严格按照以下JSON格式输出分析结果，不要添加任何额外的文本或markdown标记：

{{
  "meta": {{
    "candidate_name": "从简历中提取的姓名（如无法提取则为空字符串）",
    "target_position": "从JD中提取的目标岗位名称（如无法提取则为空字符串）",
    "analysis_version": "1.0"
}},
  "overall_score": 0,
  "dimension_scores": [
    {{ "name": "工作经历", "score": 0, "max": 100, "weight": 0.3 }},
    {{ "name": "专业技能", "score": 0, "max": 100, "weight": 0.25 }},
    {{ "name": "教育背景", "score": 0, "max": 100, "weight": 0.15 }},
    {{ "name": "项目成果", "score": 0, "max": 100, "weight": 0.2 }},
    {{ "name": "语言表达与规范", "score": 0, "max": 100, "weight": 0.1 }}
  ],
  "strengths": [
    {{
      "category": "所属维度名称",
      "title": "优点标题（简短）",
      "description": "具体优点描述"
}}
  ],
  "weaknesses": [
    {{
      "category": "所属维度名称",
      "title": "缺点标题（简短）",
      "description": "具体缺点描述",
      "suggestion": "改进建议"
}}
  ],
  "suggestions": [
    {{
      "priority": "high/medium/low",
      "action": "具体改进建议"
}}
  ],
  "summary": "整体评价总结（一段话，100-200字）"
}}

## 分析规则
1. overall_score 是各维度加权得分的总和
2. 每个维度的score在0-100之间，weight为该维度的权重
3. strengths 列出至少2个优点，最多5个
4. weaknesses 列出至少2个缺点，最多5个，每个缺点必须附带suggestion
5. suggestions 按优先级排列，至少3条，最多5条
6. 分析要客观公正，既要肯定优势也要指出不足
7. 所有描述要具体，避免空泛的评价
8. 强弱点的category必须对应dimension_scores中的维度名称`;
