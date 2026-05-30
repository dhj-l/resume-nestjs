import { Test, TestingModule } from '@nestjs/testing';
import { ResumeAiService } from './resume-ai.service';
import { BadRequestException } from '@nestjs/common';
import { ResumeAi, ResumeAiStatusEnum } from './entities/resume-ai.entity';
import { Resume } from 'src/resume/entities/resume.entity';
import { Model } from 'mongoose';

describe('ResumeAiService - validateResumeContent', () => {
  let service: ResumeAiService;
  let resumeAiModel: Model<ResumeAi>;
  let resumeModel: Model<Resume>;

  const mockResumeAiModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
  } as any;

  const mockResumeModel = {
    create: jest.fn(),
    findOne: jest.fn(),
  } as any;

  const mockAiService = {
    generateResume: jest.fn(),
  };

  const mockDocumentParserService = {
    parseDocument: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResumeAiService,
        {
          provide: 'ResumeAiModel',
          useValue: mockResumeAiModel,
        },
        {
          provide: 'ResumeModel',
          useValue: mockResumeModel,
        },
        {
          provide: 'AiService',
          useValue: mockAiService,
        },
        {
          provide: 'DocumentParserService',
          useValue: mockDocumentParserService,
        },
      ],
    }).compile();

    service = module.get<ResumeAiService>(ResumeAiService);
    resumeAiModel = module.get<Model<ResumeAi>>('ResumeAiModel');
    resumeModel = module.get<Model<Resume>>('ResumeModel');
  });

  describe('强制必填字段验证', () => {
    it('应该拒绝缺少个人信息的简历', () => {
      const resumeWithoutPersonalInfo = `
        教育背景
        2020年毕业于上海交通大学，软件工程专业，本科学历。
        在校期间成绩优异，获得过多次奖学金。
      `;

      const result = service['validateResumeContent'](
        resumeWithoutPersonalInfo,
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('缺少个人信息（姓名、联系方式等）');
      expect(result.details.hasPersonalInfo).toBe(false);
    });

    it('应该拒绝缺少教育背景的简历', () => {
      const resumeWithoutEducation = `
        个人信息
        姓名：张三
        电话：13800138000
        邮箱：zhangsan@example.com
        
        工作经历
        2020年7月至2022年8月，在某互联网公司担任前端开发工程师。
        负责公司核心产品的前端开发工作。
      `;

      const result = service['validateResumeContent'](resumeWithoutEducation);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('缺少教育背景信息');
      expect(result.details.hasEducation).toBe(false);
    });

    it('应该拒绝同时缺少个人信息和教育背景的简历', () => {
      const resumeWithoutRequiredFields = `
        工作经历
        2020年7月至2022年8月，在某互联网公司担任前端开发工程师。
        负责公司核心产品的前端开发工作。
        
        技能特长
        熟练掌握Vue3、TypeScript、Node.js等技术栈。
      `;

      const result = service['validateResumeContent'](
        resumeWithoutRequiredFields,
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('缺少个人信息（姓名、联系方式等）');
      expect(result.errors).toContain('缺少教育背景信息');
      expect(result.errors).toContain(
        '简历必须同时包含个人信息和教育背景信息才能通过校验',
      );
      expect(result.details.hasPersonalInfo).toBe(false);
      expect(result.details.hasEducation).toBe(false);
    });

    it('应该接受同时包含个人信息和教育背景的简历', () => {
      const validResume = `
        个人信息
        姓名：张三
        电话：13800138000
        邮箱：zhangsan@example.com
        
        教育背景
        2020年毕业于上海交通大学，软件工程专业，本科学历。
      `;

      const result = service['validateResumeContent'](validResume);

      expect(result.isValid).toBe(true);
      expect(result.details.hasPersonalInfo).toBe(true);
      expect(result.details.hasEducation).toBe(true);
    });
  });

  describe('个人信息字段验证', () => {
    it('应该识别包含姓名的简历', () => {
      const resumeWithName = `
        姓名：张三
        教育背景
        2020年毕业于上海交通大学。
      `;

      const result = service['validateResumeContent'](resumeWithName);

      expect(result.details.hasPersonalInfo).toBe(true);
    });

    it('应该识别包含电话的简历', () => {
      const resumeWithPhone = `
        电话：13800138000
        教育背景
        2020年毕业于上海交通大学。
      `;

      const result = service['validateResumeContent'](resumeWithPhone);

      expect(result.details.hasPersonalInfo).toBe(true);
    });

    it('应该识别包含邮箱的简历', () => {
      const resumeWithEmail = `
        邮箱：zhangsan@example.com
        教育背景
        2020年毕业于上海交通大学。
      `;

      const result = service['validateResumeContent'](resumeWithEmail);

      expect(result.details.hasPersonalInfo).toBe(true);
    });

    it('应该识别包含联系方式的简历', () => {
      const resumeWithContact = `
        联系方式：13800138000，zhangsan@example.com
        教育背景
        2020年毕业于上海交通大学。
      `;

      const result = service['validateResumeContent'](resumeWithContact);

      expect(result.details.hasPersonalInfo).toBe(true);
    });
  });

  describe('教育背景字段验证', () => {
    it('应该识别包含学校信息的简历', () => {
      const resumeWithSchool = `
        姓名：张三
        学校：上海交通大学
      `;

      const result = service['validateResumeContent'](resumeWithSchool);

      expect(result.details.hasEducation).toBe(true);
    });

    it('应该识别包含学历信息的简历', () => {
      const resumeWithDegree = `
        姓名：张三
        学历：本科
      `;

      const result = service['validateResumeContent'](resumeWithDegree);

      expect(result.details.hasEducation).toBe(true);
    });

    it('应该识别包含专业信息的简历', () => {
      const resumeWithMajor = `
        姓名：张三
        专业：软件工程
      `;

      const result = service['validateResumeContent'](resumeWithMajor);

      expect(result.details.hasEducation).toBe(true);
    });

    it('应该识别包含毕业信息的简历', () => {
      const resumeWithGraduated = `
        姓名：张三
        2020年毕业于上海交通大学。
      `;

      const result = service['validateResumeContent'](resumeWithGraduated);

      expect(result.details.hasEducation).toBe(true);
    });
  });

  describe('边界情况测试', () => {
    it('应该拒绝只有个人信息的简历', () => {
      const resumeOnlyPersonalInfo = `
        姓名：张三
        电话：13800138000
        邮箱：zhangsan@example.com
        性别：男
        年龄：30岁
      `;

      const result = service['validateResumeContent'](resumeOnlyPersonalInfo);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('缺少教育背景信息');
      expect(result.errors).toContain(
        '简历必须同时包含个人信息和教育背景信息才能通过校验',
      );
    });

    it('应该拒绝只有教育背景的简历', () => {
      const resumeOnlyEducation = `
        教育背景
        2020年毕业于上海交通大学，软件工程专业，本科学历。
        在校期间成绩优异，获得过多次奖学金。
        专业排名Top 10%。
      `;

      const result = service['validateResumeContent'](resumeOnlyEducation);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('缺少个人信息（姓名、联系方式等）');
      expect(result.errors).toContain(
        '简历必须同时包含个人信息和教育背景信息才能通过校验',
      );
    });

    it('应该拒绝内容过短的简历', () => {
      const shortResume = '姓名：张三';

      const result = service['validateResumeContent'](shortResume);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('简历内容过短');
    });

    it('应该接受包含必填字段但缺少可选字段的简历', () => {
      const resumeWithRequiredOnly = `
        姓名：张三
        电话：13800138000
        教育背景
        2020年毕业于上海交通大学，软件工程专业。
      `;

      const result = service['validateResumeContent'](resumeWithRequiredOnly);

      expect(result.isValid).toBe(true);
      expect(result.details.hasPersonalInfo).toBe(true);
      expect(result.details.hasEducation).toBe(true);
      expect(result.details.hasWorkExperience).toBe(false);
      expect(result.details.hasSkills).toBe(false);
    });

    it('应该正确处理被空格/Tab分割的中文标签', () => {
      // 模拟用户上传的简历：标签被空格和Tab拆分（常见于PDF提取或排版对齐）
      const resumeWithSpacedLabels = `
邓宏俊
求职意向：前端开发实习生 | 一周内到岗
年 \t龄 \t21 岁 \t性 \t别 \t男
电 \t话 \t18371332606 \t邮 \t箱 \t3134504258@qq.com
学 \t历 \t黄冈师范学院(本科)
毕业时间 \t27届 \t专 \t业 \t网络工程
自我评价
具有两段C端业务公司的实习经历，参与过电商+AI Agent相关的业务开发工作
实习经历
2025-05 ~ 2025-09 \t北京京控信息技术有限公司 \t前端开发工程师
      `;

      const result = service['validateResumeContent'](
        resumeWithSpacedLabels,
      );

      expect(result.isValid).toBe(true);
      expect(result.details.hasPersonalInfo).toBe(true);
      expect(result.details.hasEducation).toBe(true);
      expect(result.details.hasContactInfo).toBe(true);
      expect(result.details.hasWorkExperience).toBe(true);
      expect(result.details.hasSelfEvaluation).toBe(true);
    });

    it('应该正确处理全角空格分隔的中文标签', () => {
      const resumeWithFullWidthSpaces = `
姓名：张三
电　话：13800138000
学　历：北京大学
专　业：计算机科学
      `;

      const result = service['validateResumeContent'](
        resumeWithFullWidthSpaces,
      );

      // 全角空格 "电　话" 中 "电" 和 "话" 之间是 U+3000，应被归一化
      expect(result.details.hasPersonalInfo).toBe(true);
      expect(result.details.hasEducation).toBe(true);
    });
  });

  describe('评分系统测试', () => {
    it('应该为包含必填字段的简历计算正确分数', () => {
      const resumeWithRequiredFields = `
        姓名：张三
        电话：13800138000
        教育背景
        2020年毕业于上海交通大学。
      `;

      const result = service['validateResumeContent'](resumeWithRequiredFields);

      expect(result.score).toBeGreaterThan(0);
      expect(result.details.hasPersonalInfo).toBe(true);
      expect(result.details.hasEducation).toBe(true);
    });

    it('应该为包含联系方式的个人信息给予更高分数', () => {
      const resumeWithContact = `
        姓名：张三
        电话：13800138000
        邮箱：zhangsan@example.com
        教育背景
        2020年毕业于上海交通大学。
      `;

      const result = service['validateResumeContent'](resumeWithContact);

      const resumeWithoutContact = `
        姓名：张三
        教育背景
        2020年毕业于上海交通大学。
      `;

      const resultWithoutContact =
        service['validateResumeContent'](resumeWithoutContact);

      expect(result.score).toBeGreaterThan(resultWithoutContact.score);
    });
  });
});
