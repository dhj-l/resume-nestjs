# Tasks

- [x] Task 1: 更新 resume.entity.ts 实体文件，创建新的对象类型并修改字段定义
  - [x] SubTask 1.1: 创建 Skills 嵌套 Schema 类，包含 content 和 globalSort 字段
  - [x] SubTask 1.2: 创建 Certificates 嵌套 Schema 类，包含 content 和 globalSort 字段
  - [x] SubTask 1.3: 创建 SelfEvaluation 嵌套 Schema 类，包含 content 和 globalSort 字段
  - [x] SubTask 1.4: 修改 Resume 实体中 skills、certificates、selfEvaluation 字段类型

- [x] Task 2: 更新 update-resume.dto.ts 文件，创建新的 DTO 类并修改字段定义
  - [x] SubTask 2.1: 创建 SkillsDto 类，包含 content 和 globalSort 验证
  - [x] SubTask 2.2: 创建 CertificatesDto 类，包含 content 和 globalSort 验证
  - [x] SubTask 2.3: 创建 SelfEvaluationDto 类，包含 content 和 globalSort 验证
  - [x] SubTask 2.4: 修改 UpdateResumeDto 中相关字段类型和验证装饰器

- [x] Task 3: 更新 create-resume.dto.ts 文件，创建新的 DTO 类并修改字段定义
  - [x] SubTask 3.1: 创建 SkillsDto 类，包含 content 和 globalSort 验证
  - [x] SubTask 3.2: 创建 CertificatesDto 类，包含 content 和 globalSort 验证
  - [x] SubTask 3.3: 创建 SelfEvaluationDto 类，包含 content 和 globalSort 验证
  - [x] SubTask 3.4: 修改 CreateResumeDto 中相关字段类型和验证装饰器

- [x] Task 4: 更新 resume_ai.ts prompt 模板，修改 JSON 结构示例
  - [x] SubTask 4.1: 更新 resumeAiPrompt 中的 skills、certificates、selfEvaluation 字段结构
  - [x] SubTask 4.2: 更新 ContentPromt 中的 skills、certificates、selfEvaluation 字段结构
  - [x] SubTask 4.3: 更新排序字段规范说明，添加新字段的默认 globalSort 值

- [x] Task 5: 更新 resume-ai.service.ts 服务文件，处理新的对象结构
  - [x] SubTask 5.1: 检查并更新 AI 生成结果的处理逻辑，确保正确解析对象化字段

- [x] Task 6: 验证和测试
  - [x] SubTask 6.1: 运行 TypeScript 编译检查
  - [x] SubTask 6.2: 验证数据结构变更是否正确

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 1]
- [Task 5] depends on [Task 1, Task 4]
- [Task 6] depends on [Task 1, Task 2, Task 3, Task 4, Task 5]
