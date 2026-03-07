# Tasks

- [x] Task 1: 更新 resume.entity.ts 实体文件，为数组类型实体添加排序字段
  - [x] SubTask 1.1: 为 EducationBackground 添加 globalSort 和 localSort 字段
  - [x] SubTask 1.2: 为 WorkExperience 添加 globalSort 和 localSort 字段
  - [x] SubTask 1.3: 为 CampusExperience 添加 globalSort 和 localSort 字段
  - [x] SubTask 1.4: 为 ProjectExperience 添加 globalSort 和 localSort 字段
  - [x] SubTask 1.5: 为 InternshipExperience 添加 globalSort 和 localSort 字段

- [x] Task 2: 更新 update-resume.dto.ts 文件，为 DTO 类添加排序字段验证
  - [x] SubTask 2.1: 为 EducationBackgroundDto 添加排序字段验证
  - [x] SubTask 2.2: 为 WorkExperienceDto 添加排序字段验证
  - [x] SubTask 2.3: 为 CampusExperienceDto 添加排序字段验证
  - [x] SubTask 2.4: 为 ProjectExperienceDto 添加排序字段验证
  - [x] SubTask 2.5: 为 InternshipExperienceDto 添加排序字段验证

- [x] Task 3: 更新 create-resume.dto.ts 文件，为 DTO 类添加排序字段验证
  - [x] SubTask 3.1: 为 EducationBackgroundDto 添加排序字段验证
  - [x] SubTask 3.2: 为 WorkExperienceDto 添加排序字段验证
  - [x] SubTask 3.3: 为 CampusExperienceDto 添加排序字段验证
  - [x] SubTask 3.4: 为 ProjectExperienceDto 添加排序字段验证
  - [x] SubTask 3.5: 为 InternshipExperienceDto 添加排序字段验证

- [x] Task 4: 更新 resume.service.ts，添加排序字段自动处理逻辑
  - [x] SubTask 4.1: 在 update 方法中添加排序字段处理逻辑
  - [x] SubTask 4.2: 在 create 方法中添加排序字段处理逻辑

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1]
- [Task 4] depends on [Task 1, Task 2, Task 3]
