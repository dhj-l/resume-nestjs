import { Test, TestingModule } from '@nestjs/testing';
import { ResumeAiService } from './resume-ai.service';
import {
  ResumeAiStatusEnum,
  ResumeAiTypeEnum,
} from './entities/resume-ai.entity';
import { RunnableLambda } from '@langchain/core/runnables';
import { AiService } from 'src/ai/ai.service';
import { DocumentParserService } from './document-parser.service';
import { ANALYSIS_TIMEOUT_MS } from './analysis.utils';
import { SseMessage } from './types/sse.types';
import { MODULE_EXECUTION_ORDER } from './prompt/modules';

describe('ResumeAiService - validateResumeContent', () => {
  let service: ResumeAiService;

  const mockResumeAiModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
  } as any;

  const mockResumeModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
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

  const mockQuestionRecordModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    updateMany: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
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
          provide: 'ResumeQuestionRecordModel',
          useValue: mockQuestionRecordModel,
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
      expect(result.errors).toContain(
        '简历必须同时包含个人信息和教育背景信息才能通过校验',
      );
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
        2016年9月至2020年6月，上海交通大学，软件工程专业，本科学历。
        在校期间成绩优异，专业排名Top 10%。

        工作经历
        2020年7月至今，在某互联网公司担任前端开发工程师，负责核心产品开发。
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
      expect(result.errors).toContain('简历内容过短，至少需要100个字符');
    });

    it('应该接受包含必填字段但缺少可选字段的简历', () => {
      const resumeWithRequiredOnly = `
        姓名：张三
        电话：13800138000
        邮箱：zhangsan@example.com

        教育背景
        2016年9月至2020年6月，上海交通大学，软件工程专业，本科学历。
        在校期间成绩优异，专业排名Top 10%。

        自我评价
        对前端技术充满热情，具有扎实的专业基础与务实的态度。
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
      /* eslint-disable no-irregular-whitespace */
      const resumeWithFullWidthSpaces = `
姓名：张三
电　话：13800138000
学　历：北京大学
专　业：计算机科学
      `;
      /* eslint-enable no-irregular-whitespace */

      const result = service['validateResumeContent'](
        resumeWithFullWidthSpaces,
      );

      // 全角空格（U+3000）应被归一化，使标签能正确匹配
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

  describe('generateResumeSse', () => {
    const validJd = `前端开发工程师
工作地点：上海
公司介绍：某互联网公司，专注于互联网产品研发。
职位描述
1、负责公司核心产品的前端开发工作；
2、参与前端架构设计与性能优化；
3、与产品、设计团队协作，交付高质量用户体验。
岗位职责
1、使用 Vue3/React 进行前端开发；
2、维护和优化现有前端代码；
3、编写单元测试与文档。
任职要求
1、本科及以上学历，计算机相关专业；
2、3年以上工作经验，熟悉前端工程化；
3、熟悉 TypeScript、Node.js。
薪资待遇：面议，提供有竞争力的薪酬福利`;

    const validResumeContent = `姓名：张三
电话：13800138000
邮箱：zhangsan@example.com

教育背景
2016年9月至2020年6月，上海交通大学，软件工程专业，本科学历。
在校期间成绩优异，获得过多次奖学金。

工作经历
2020年7月至2023年8月，在某互联网公司担任前端开发工程师。
负责公司核心产品的前端开发与架构设计。

技能特长
熟练掌握Vue3、TypeScript、Node.js等技术栈。`;

    // mock 模型返回的完整简历数据（各模块共用，聚合后用于创建简历）
    const fullResumeData = {
      basicInfo: {
        name: '张三',
        phone: '13800138000',
        email: 'zhangsan@example.com',
      },
      jobIntention: { position: '前端开发工程师' },
      globalStyle: { theme: 'default' },
      skills: { content: 'Vue3, TypeScript, Node.js' },
      certificates: { content: '无' },
      selfEvaluation: { content: '具备良好的工程能力' },
      educationBackground: [
        { school: '上海交通大学', degree: '本科', major: '软件工程' },
      ],
      workExperience: [
        { company: '某公司', position: '前端', workDescription: '负责开发' },
      ],
      projectExperience: [{ name: '项目一', content: '项目描述' }],
      campusExperience: [{ content: '校园经历' }],
      internshipExperience: [{ description: '实习经历' }],
    };

    // 合法的 ObjectId（createResume 内部会 new Types.ObjectId(userId)）
    const userId = '507f1f77bcf86cd799439011';

    beforeEach(() => {
      jest.clearAllMocks();
      jest.useFakeTimers();

      (mockResumeAiModel.create as jest.Mock).mockResolvedValue({
        _id: 'record-1',
        templateType: 'default',
        save: jest.fn().mockResolvedValue(undefined),
      });
      (mockResumeAiModel.updateOne as jest.Mock).mockResolvedValue({
        matchedCount: 1,
      });
      (mockResumeModel.create as jest.Mock).mockResolvedValue({
        _id: 'resume-id-123',
      });
      (mockResumeModel.findById as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(fullResumeData),
      });
      (mockResumeModel.findByIdAndUpdate as jest.Mock).mockResolvedValue({});
      (mockAiUsageRecordModel.create as jest.Mock).mockResolvedValue({});
      // 跳过重试退避的真实延迟
      jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('完整流程按序推送 progress 消息且最终为 complete 并携带 resumeId', async () => {
      const mockModel = RunnableLambda.from(async () =>
        JSON.stringify(fullResumeData),
      );
      mockAiService.generateResume = jest.fn().mockReturnValue(mockModel);

      const dto = {
        parseType: ResumeAiTypeEnum.Upload,
        jobDescription: validJd,
        templateType: 'default',
        resumeContent: validResumeContent,
      };

      const observable = service.generateResumeSse(dto as any, userId);
      const messages: SseMessage[] = [];
      await new Promise<void>((resolve, reject) => {
        observable.subscribe({
          next: (msg) => messages.push(msg),
          error: (err) => reject(err),
          complete: () => resolve(),
        });
      });

      // 每个模块按序推送 processing -> completed 两条 progress 消息
      const progressMessages = messages.filter((m) => m.type === 'progress');
      expect(progressMessages).toHaveLength(MODULE_EXECUTION_ORDER.length * 2);
      // 首帧为 init，携带草稿 resumeId，前端据此立即进入编辑页
      expect(messages[0]).toMatchObject({
        type: 'init',
        status: 'started',
        resumeId: 'resume-id-123',
        totalModules: MODULE_EXECUTION_ORDER.length,
        currentModule: 0,
      });
      for (let i = 0; i < MODULE_EXECUTION_ORDER.length; i++) {
        const [moduleName] = MODULE_EXECUTION_ORDER[i];
        const processing = progressMessages[i * 2];
        const completed = progressMessages[i * 2 + 1];
        expect(processing.moduleName).toBe(moduleName);
        expect(processing.status).toBe('processing');
        expect(processing.currentModule).toBe(i + 1);
        expect(processing.totalModules).toBe(MODULE_EXECUTION_ORDER.length);
        expect(completed.moduleName).toBe(moduleName);
        expect(completed.status).toBe('completed');
      }

      // 最终推送 type: 'complete' 消息，携带 resumeId
      const completeMessages = messages.filter((m) => m.type === 'complete');
      expect(completeMessages).toHaveLength(1);
      expect(completeMessages[0]).toMatchObject({
        type: 'complete',
        status: 'completed',
        message: '简历生成完成',
        resumeId: 'resume-id-123',
        totalModules: MODULE_EXECUTION_ORDER.length,
        currentModule: MODULE_EXECUTION_ORDER.length,
      });
      expect(mockAiService.generateResume).toHaveBeenCalled();
      expect(mockResumeModel.create).toHaveBeenCalled();
      // 草稿仅创建一次（生成开始前），结束后标记 completed
      expect(mockResumeModel.create).toHaveBeenCalledTimes(1);
      expect(mockResumeModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'resume-id-123',
        { $set: { aiStatus: 'completed' } },
      );
      // completed 帧携带模块生成数据，供前端增量渲染
      const completedProgress = progressMessages.filter(
        (m) => m.status === 'completed',
      );
      expect(completedProgress).toHaveLength(MODULE_EXECUTION_ORDER.length);
      expect(completedProgress[0].data).toBeDefined();
      expect(mockResumeAiModel.updateOne).toHaveBeenCalledWith(
        { _id: 'record-1' },
        { $set: { status: ResumeAiStatusEnum.Completed } },
      );
    });

    it('模块失败时推送 type: error', async () => {
      const failingModel = RunnableLambda.from(async () => {
        throw new Error('AI调用失败');
      });
      mockAiService.generateResume = jest.fn().mockReturnValue(failingModel);

      const dto = {
        parseType: ResumeAiTypeEnum.Upload,
        jobDescription: validJd,
        templateType: 'default',
        resumeContent: validResumeContent,
      };

      const observable = service.generateResumeSse(dto as any, userId);
      const messages: SseMessage[] = [];
      await new Promise<void>((resolve) => {
        observable.subscribe({
          next: (msg) => messages.push(msg),
          error: () => resolve(),
          complete: () => resolve(),
        });
      });

      // 修复：最后一次重试失败后不再发送"重试中"消息。
      // maxRetries=3 时仅前两次失败发重试消息（retryCount=1、2），第三次失败直接放弃。
      const retryingMessages = messages.filter((m) => m.status === 'retrying');
      expect(retryingMessages).toHaveLength(2);
      expect(Math.max(...retryingMessages.map((m) => m.retryCount ?? 0))).toBe(
        2,
      );

      const errorMessages = messages.filter((m) => m.type === 'error');
      expect(errorMessages.length).toBeGreaterThanOrEqual(1);
      expect(errorMessages[errorMessages.length - 1]).toMatchObject({
        type: 'error',
        status: 'failed',
        resumeId: 'resume-id-123',
      });
      expect(mockResumeModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'resume-id-123',
        { $set: { aiStatus: 'failed' } },
      );
      expect(mockResumeAiModel.updateOne).toHaveBeenCalledWith(
        { _id: 'record-1' },
        { $set: { status: ResumeAiStatusEnum.Failed } },
      );
    });

    it('Upload 只选 workExperience 时自动补全依赖模块且 complete totalModules=3', async () => {
      const mockModel = RunnableLambda.from(async () =>
        JSON.stringify(fullResumeData),
      );
      mockAiService.generateResume = jest.fn().mockReturnValue(mockModel);

      const dto = {
        parseType: ResumeAiTypeEnum.Upload,
        jobDescription: validJd,
        templateType: 'default',
        resumeContent: validResumeContent,
        modules: ['workExperience'],
      };

      const observable = service.generateResumeSse(dto as any, userId);
      const messages: SseMessage[] = [];
      await new Promise<void>((resolve, reject) => {
        observable.subscribe({
          next: (msg) => messages.push(msg),
          error: (err) => reject(err),
          complete: () => resolve(),
        });
      });

      // workExperience 依赖 basicInfo + educationBackground，按后端顺序补全
      const progressMessages = messages.filter((m) => m.type === 'progress');
      expect(progressMessages).toHaveLength(6);
      expect(progressMessages.map((m) => m.moduleName)).toEqual([
        'basicInfo',
        'basicInfo',
        'educationBackground',
        'educationBackground',
        'workExperience',
        'workExperience',
      ]);
      expect(progressMessages[0].totalModules).toBe(3);
      expect(progressMessages[0].currentModule).toBe(1);
      expect(progressMessages[4].currentModule).toBe(3);

      const completeMessages = messages.filter((m) => m.type === 'complete');
      expect(completeMessages).toHaveLength(1);
      expect(completeMessages[0]).toMatchObject({
        type: 'complete',
        totalModules: 3,
        currentModule: 3,
        resumeId: 'resume-id-123',
      });
      expect(mockResumeModel.create).toHaveBeenCalledTimes(1);
    });

    it('Upload 部分生成：AI 缺失的模块回填 schema 合法默认值', async () => {
      const mockModel = RunnableLambda.from(async () =>
        JSON.stringify({
          basicInfo: { name: '张三', phone: '13800138000' },
        }),
      );
      mockAiService.generateResume = jest.fn().mockReturnValue(mockModel);

      const dto = {
        parseType: ResumeAiTypeEnum.Upload,
        jobDescription: validJd,
        templateType: 'default',
        resumeContent: validResumeContent,
        modules: ['basicInfo'],
      };

      const observable = service.generateResumeSse(dto as any, userId);
      const messages: SseMessage[] = [];
      await new Promise<void>((resolve, reject) => {
        observable.subscribe({
          next: (msg) => messages.push(msg),
          error: (err) => reject(err),
          complete: () => resolve(),
        });
      });

      const createdResume = (mockResumeModel.create as jest.Mock).mock
        .calls[0][0];
      // 草稿先行：创建时 basicInfo 为 schema 合法默认值，AI 数据后续增量写入
      expect(createdResume.basicInfo).toEqual({ name: '' });
      expect(createdResume.educationBackground).toEqual([]);
      expect(createdResume.workExperience).toEqual([]);
      expect(createdResume.jobIntention).toEqual({});
      expect(createdResume.aiStatus).toBe('generating');

      // 已生成模块数据通过增量更新写入草稿，并推送给前端
      expect(mockResumeModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'resume-id-123',
        {
          $set: {
            basicInfo: { name: '张三', phone: '13800138000' },
          },
        },
      );
      const completedProgress = messages.filter(
        (m) => m.type === 'progress' && m.status === 'completed',
      );
      expect(completedProgress[0].data).toEqual({
        name: '张三',
        phone: '13800138000',
      });

      const completeMessages = messages.filter((m) => m.type === 'complete');
      expect(completeMessages).toHaveLength(1);
      expect(completeMessages[0]).toMatchObject({ totalModules: 1 });
    });

    it('Select 部分生成：未选模块继承原简历数据，不被清空', async () => {
      const sourceResume = {
        _id: 'resume-source-1',
        title: '李四的简历',
        // 原简历（来自 lean()）携带的元数据，buildDraftData 必须剔除，避免污染草稿
        cover: 'old-cover.png',
        isTemplate: false,
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-02-01'),
        basicInfo: {
          name: '李四',
          phone: '13900000000',
          email: 'lisi@example.com',
        },
        jobIntention: { position: '后端工程师' },
        globalStyle: { fontSize: '14px' },
        skills: { content: 'Node.js' },
        certificates: { content: '无' },
        selfEvaluation: { content: '旧自我评价' },
        educationBackground: [
          {
            schoolName: '复旦大学',
            degree: '本科',
            major: '计算机科学',
            enrollmentTime: '2016-09',
            graduationTime: '2020-06',
          },
        ],
        workExperience: [
          {
            companyName: '旧公司',
            position: '后端',
            workTime: '2020-07',
            dismissalTime: '2023-08',
            workDescription: '旧工作内容',
          },
        ],
        projectExperience: [],
        campusExperience: [],
        internshipExperience: [],
      };
      (mockResumeModel.findOne as jest.Mock).mockResolvedValue({
        toObject: () => sourceResume,
      });

      const mockModel = RunnableLambda.from(async () =>
        JSON.stringify({
          workExperience: [
            {
              companyName: '新公司',
              position: '前端',
              workTime: '2024-01',
              dismissalTime: '至今',
              workDescription: '新工作内容',
            },
          ],
        }),
      );
      mockAiService.generateResume = jest.fn().mockReturnValue(mockModel);

      const dto = {
        parseType: ResumeAiTypeEnum.Select,
        jobDescription: validJd,
        templateType: 'default',
        resumeId: 'resume-source-1',
        modules: ['workExperience'],
      };

      const observable = service.generateResumeSse(dto as any, userId);
      const messages: SseMessage[] = [];
      await new Promise<void>((resolve, reject) => {
        observable.subscribe({
          next: (msg) => messages.push(msg),
          error: (err) => reject(err),
          complete: () => resolve(),
        });
      });

      // Select 场景保持用户选择：只执行 workExperience
      const progressMessages = messages.filter((m) => m.type === 'progress');
      expect(progressMessages.map((m) => m.moduleName)).toEqual([
        'workExperience',
        'workExperience',
      ]);
      expect(progressMessages[0].totalModules).toBe(1);

      const createdResume = (mockResumeModel.create as jest.Mock).mock
        .calls[0][0];
      // 未选模块从原简历继承
      expect(createdResume.basicInfo).toEqual(sourceResume.basicInfo);
      expect(createdResume.educationBackground).toEqual(
        sourceResume.educationBackground,
      );
      expect(createdResume.globalStyle).toEqual({ fontSize: '14px' });
      expect(createdResume.skills).toEqual({ content: 'Node.js' });
      // AI 生成简历标题按 用户名-岗位名称 组装
      expect(createdResume.title).toBe('李四-后端工程师');
      // 草稿初始继承原简历数据（含已选模块的旧数据）
      expect(createdResume.workExperience).toEqual(sourceResume.workExperience);
      // 修复：buildDraftData 必须剔除原简历元数据，避免草稿继承旧封面/创建时间/模板标记
      expect(createdResume.cover).toBeUndefined();
      expect(createdResume.isTemplate).toBeUndefined();
      expect(createdResume.createdAt).toBeUndefined();
      expect(createdResume.updatedAt).toBeUndefined();
      // 已选模块生成后通过增量更新写入新数据
      expect(mockResumeModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'resume-id-123',
        {
          $set: {
            workExperience: [
              {
                companyName: '新公司',
                position: '前端',
                workTime: '2024-01',
                dismissalTime: '至今',
                workDescription: '新工作内容',
              },
            ],
          },
        },
      );
      const completedProgress = messages.filter(
        (m) => m.type === 'progress' && m.status === 'completed',
      );
      expect(completedProgress[0].data).toEqual([
        {
          companyName: '新公司',
          position: '前端',
          workTime: '2024-01',
          dismissalTime: '至今',
          workDescription: '新工作内容',
        },
      ]);
    });

    it('resolveModules：缺省/空数组默认全部，非法 key 过滤，全部非法时抛错', () => {
      const allModuleKeys = MODULE_EXECUTION_ORDER.map(([name]) => name);

      expect(service['resolveModules'](undefined)).toEqual(allModuleKeys);
      expect(service['resolveModules']([])).toEqual(allModuleKeys);
      expect(
        service['resolveModules']([
          'unknown',
          'basicInfo',
          'workExperience',
          'unknown',
        ]),
      ).toEqual(['basicInfo', 'educationBackground', 'workExperience']);
      expect(() =>
        service['resolveModules'](['not-a-module', 'also-invalid']),
      ).toThrow('至少选择一个有效的生成模块');
    });

    it('resolveModules：Upload 自动补全依赖与 basicInfo，Select 保持原选择', () => {
      expect(service['resolveModules'](['workExperience'])).toEqual([
        'basicInfo',
        'educationBackground',
        'workExperience',
      ]);
      expect(service['resolveModules'](['selfEvaluation'])).toEqual([
        'basicInfo',
        'skills',
        'selfEvaluation',
      ]);
      expect(service['resolveModules'](['jobIntention'])).toEqual([
        'basicInfo',
        'jobIntention',
      ]);
      expect(service['resolveModules'](['workExperience'], true)).toEqual([
        'workExperience',
      ]);
    });

    it('AI 简历标题按 用户名-岗位名称 组装，无法提取时回退', () => {
      // Select：继承原简历基本信息与求职意向（兼容 position 旧字段）
      expect(
        service['buildAiResumeTitle'](
          { parseType: ResumeAiTypeEnum.Select } as any,
          {
            basicInfo: { name: '李四' },
            jobIntention: { jobIntention: '后端工程师' },
          },
        ),
      ).toBe('李四-后端工程师');
      expect(
        service['buildAiResumeTitle'](
          { parseType: ResumeAiTypeEnum.Select } as any,
          {
            basicInfo: { name: '李四' },
            jobIntention: { position: '后端工程师' },
          },
        ),
      ).toBe('李四-后端工程师');
      // Upload：从简历文本提取姓名与求职意向（竖线分隔截断）
      expect(
        service['buildAiResumeTitle']({
          parseType: ResumeAiTypeEnum.Upload,
          resumeContent: '姓名：王五\n求职意向：前端开发工程师 | 一周内到岗',
        } as any),
      ).toBe('王五-前端开发工程师');
      // 无法提取时回退
      expect(
        service['buildAiResumeTitle']({
          parseType: ResumeAiTypeEnum.Upload,
          resumeContent: '无有效简历信息',
        } as any),
      ).toBe('AI 生成简历');
    });

    describe('normalizeDraftSortFields - 草稿排序字段归一化', () => {
      it('缺失值（落库补 0）按默认序号补位，不得抢占 AI 指定的顺序', async () => {
        (mockResumeModel.findById as jest.Mock).mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            workExperience: [{ name: 'A', globalSort: 2, localSort: 2 }],
            // globalSort=0 是缺失字段落库时被 schema default 补齐的形态
            projectExperience: [{ name: 'P', globalSort: 0, localSort: 1 }],
            educationBackground: [{ name: 'E', globalSort: 1, localSort: 1 }],
            skills: { content: 'a,b', globalSort: 0 },
            certificates: { content: 'c', globalSort: 7 },
          }),
        });
        (mockResumeModel.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

        await service['normalizeDraftSortFields']('resume-id-123');

        // 缺失的 project/skills 按默认序号 2/6 参与排序，而非旧的 0 排最前；
        // 重编号后 education=1、work=2、project=3；缺席的 internship/campus/
        // selfEvaluation 占位 4/5/8（不写回），skills/certificates 保持 6/7
        expect(mockResumeModel.findByIdAndUpdate).toHaveBeenCalledWith(
          'resume-id-123',
          {
            $set: {
              educationBackground: [{ name: 'E', globalSort: 1, localSort: 1 }],
              workExperience: [{ name: 'A', globalSort: 2, localSort: 1 }],
              projectExperience: [{ name: 'P', globalSort: 3, localSort: 1 }],
              'skills.globalSort': 6,
              'certificates.globalSort': 7,
            },
          },
        );
      });

      it('全部缺失时按 prompt 默认顺序重编号 1..8', async () => {
        (mockResumeModel.findById as jest.Mock).mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            workExperience: [{ name: 'A', globalSort: 0, localSort: 1 }],
            projectExperience: [{ name: 'P', globalSort: 0, localSort: 1 }],
            educationBackground: [{ name: 'E', globalSort: 0, localSort: 1 }],
            internshipExperience: [{ name: 'I', globalSort: 0, localSort: 1 }],
            campusExperience: [{ name: 'C', globalSort: 0, localSort: 1 }],
            skills: { content: 'a,b', globalSort: 0 },
            certificates: { content: 'c', globalSort: 0 },
            selfEvaluation: { content: 's', globalSort: 0 },
          }),
        });
        (mockResumeModel.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

        await service['normalizeDraftSortFields']('resume-id-123');

        const update = (mockResumeModel.findByIdAndUpdate as jest.Mock).mock
          .calls[0][1].$set;
        expect(update.workExperience[0].globalSort).toBe(1);
        expect(update.projectExperience[0].globalSort).toBe(2);
        expect(update.educationBackground[0].globalSort).toBe(3);
        expect(update.internshipExperience[0].globalSort).toBe(4);
        expect(update.campusExperience[0].globalSort).toBe(5);
        expect(update['skills.globalSort']).toBe(6);
        expect(update['certificates.globalSort']).toBe(7);
        expect(update['selfEvaluation.globalSort']).toBe(8);
      });

      it('空数组模块跳过写回，数组内 localSort 按既有相对顺序重编', async () => {
        (mockResumeModel.findById as jest.Mock).mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            workExperience: [
              { name: 'A', globalSort: 5, localSort: 0 },
              { name: 'B', globalSort: 5, localSort: 0 },
            ],
            campusExperience: [],
          }),
        });
        (mockResumeModel.findByIdAndUpdate as jest.Mock).mockResolvedValue({});

        await service['normalizeDraftSortFields']('resume-id-123');

        // work=4：前方 project/education/internship 缺席但占号 1/2/3（不写回）；
        // 空数组 campus 跳过写回；localSort 保持既有相对顺序重编为 1..2
        expect(mockResumeModel.findByIdAndUpdate).toHaveBeenCalledWith(
          'resume-id-123',
          {
            $set: {
              workExperience: [
                { name: 'A', globalSort: 4, localSort: 1 },
                { name: 'B', globalSort: 4, localSort: 2 },
              ],
            },
          },
        );
      });
    });
  });
});
