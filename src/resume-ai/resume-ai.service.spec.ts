import { Test, TestingModule } from '@nestjs/testing';
import { ResumeAiService } from './resume-ai.service';
import { BadRequestException } from '@nestjs/common';
import { ResumeAi, ResumeAiStatusEnum } from './entities/resume-ai.entity';
import { Resume } from 'src/resume/entities/resume.entity';
import { Model } from 'mongoose';
import { RunnableLambda } from '@langchain/core/runnables';
import { AiService } from 'src/ai/ai.service';
import { DocumentParserService } from './document-parser.service';
import { ANALYSIS_TIMEOUT_MS } from './analysis.utils';

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

  const mockEditRecordModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    findByIdAndDelete: jest.fn(),
  } as any;

  const mockAnalysisRecordModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    updateMany: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  } as any;

  const mockAiUsageRecordModel = {
    create: jest.fn(),
  } as any;

  const mockAiService = {
    generateResume: jest.fn(),
    generateAnalyzeResume: jest.fn(),
    createStructuredParser: jest.fn(),
    createRobustStructuredParser: jest.fn(),
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
          provide: 'ResumeEditRecordModel',
          useValue: mockEditRecordModel,
        },
        {
          provide: 'ResumeAnalysisRecordModel',
          useValue: mockAnalysisRecordModel,
        },
        {
          provide: 'AiUsageRecordModel',
          useValue: mockAiUsageRecordModel,
        },
        {
          provide: AiService,
          useValue: mockAiService,
        },
        {
          provide: DocumentParserService,
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

      const result = service['validateResumeContent'](resumeWithSpacedLabels);

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

  describe('analyzeResume 超时降级', () => {
    const validJd = `Agent全栈开发工程师 - 数据平台
上海、杭州
正式
研发 - 前端
2027届校园招聘
职位 ID：A103143
职位描述
团队介绍：数据平台是字节跳动数据中台部门，为公司多业务线（包括抖音、电商、直播和生活服务等）提供一站式大数据解决方案，涵盖数据的生产、清洗、传输、建模、分析等全流程链路，提供数据开发、实验评估、画像标签、增强分析等多元场景解决能力。同时，数据平台部门也致力于把字节跳动积累沉淀的数据中台解决方案做商业化输出，让更多行业能够应用我们的产品能力构建自己的数据中台。在火山引擎上，我们提供了营销增长套件，数据中台等相关产品解决方案，为泛互联网、金融、汽车、新零售等行业提供了行业解决方案。

1、参与数据平台的前端产品与Agent应用的全栈研发，覆盖Web前端、Node/BFF、服务端接口与Agent Skill，编写高质量、可维护的代码；
2、参与Agent能力及相关服务的建设，涉及Prompt Engineering、Workflow、Multi-Agent、Tool Calling等技术方向；
3、结合数据分析、数据可视化等业务场景，参与Agent解决方案的设计与落地；
4、持续进行性能优化和架构升级，支撑内部业务及商业化客户需求，不断提升团队效率和产品体验；
5、跟踪大模型与Agent领域前沿技术，推动新技术在业务中的落地。

职位要求
1、2027届获得本科及以上学历，计算机、软件工程等相关专业优先；
2、扎实的Web前端基础，熟悉HTML、CSS、JavaScript/TypeScript与HTTP协议，了解浏览器渲染与常见性能问题；
3、具备工程能力与全栈潜力，熟悉常用数据结构与设计模式，掌握Python、Java、Go、Node.js中至少一种服务端语言，能够独立完成从前端到接口的小型闭环开发；
4、学习能力强，喜欢钻研，工作积极主动，能够独立思考，具有良好的团队合作精神和沟通能力。

加分项：
1、对大模型与Agent有真实的动手经验，做过基于大模型API、Agent框架、Prompt/评测相关的项目；或者有数据产品相关项目经验。`;

    const resumeDoc = {
      _id: 'resume-1',
      basicInfo: { name: '张三', phone: '13800138000' },
      jobIntention: { position: '前端开发工程师' },
      educationBackground: [{ school: '上海交通大学', degree: '本科' }],
      workExperience: [],
      projectExperience: [],
      skills: ['Vue', 'TypeScript'],
      certificates: [],
      selfEvaluation: '',
      campusExperience: [],
      internshipExperience: [],
    };

    beforeEach(() => {
      jest.clearAllMocks();
      (mockResumeModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      (mockAnalysisRecordModel.create as jest.Mock).mockResolvedValue({
        _id: 'record-1',
      });
      (mockAnalysisRecordModel.findOne as jest.Mock).mockResolvedValue(null);
      (mockAnalysisRecordModel.updateMany as jest.Mock).mockResolvedValue({});
      (
        mockAnalysisRecordModel.findByIdAndUpdate as jest.Mock
      ).mockResolvedValue({});
      (mockAiUsageRecordModel.create as jest.Mock).mockResolvedValue({});
      jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
    });

    it('第一次调用超时后，第二次使用 disabled 模式并成功返回', async () => {
      jest.useFakeTimers();
      try {
        const timeoutModel = RunnableLambda.from(
          async (_input: any, config?: any) => {
            await new Promise<never>((_resolve, reject) => {
              const signal = config?.signal;
              if (!signal) {
                reject(new Error('缺少 abort signal'));
                return;
              }
              signal.addEventListener(
                'abort',
                () => {
                  reject(
                    Object.assign(new Error('AI分析超时'), {
                      name: 'AbortError',
                    }),
                  );
                },
                { once: true },
              );
            });
          },
        );
        const okModel = RunnableLambda.from(async () =>
          JSON.stringify({ overall_score: 70, summary: '整体匹配度良好' }),
        );
        const generateAnalyzeResume = jest
          .fn()
          .mockReturnValueOnce(timeoutModel)
          .mockReturnValueOnce(okModel);
        const robustParser = RunnableLambda.from(async (text: string) =>
          JSON.parse(text),
        );

        mockAiService.generateAnalyzeResume = generateAnalyzeResume;
        mockAiService.createRobustStructuredParser = jest
          .fn()
          .mockReturnValue(robustParser);

        const analyzing = service.analyzeResume(
          { resumeId: 'resume-1', jobDescription: validJd },
          'user-1',
        );
        await jest.advanceTimersByTimeAsync(ANALYSIS_TIMEOUT_MS + 10);
        const result = await analyzing;

        expect(generateAnalyzeResume).toHaveBeenCalledTimes(2);
        expect(generateAnalyzeResume.mock.calls[0]).toEqual([]);
        expect(generateAnalyzeResume.mock.calls[1]).toEqual(['disabled']);
        expect(mockAnalysisRecordModel.findByIdAndUpdate).toHaveBeenCalledWith(
          'record-1',
          expect.objectContaining({ status: 'completed' }),
        );
        expect(result.analysisResult.overall_score).toBe(70);
        expect(result.analysisResult.summary).toBe('整体匹配度良好');
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
