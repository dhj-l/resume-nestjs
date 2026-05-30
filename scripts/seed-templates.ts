/**
 * 简历模板种子脚本
 * 向数据库中添加几条简历模板数据，用于测试整体流程
 *
 * 使用方式：
 *   npx ts-node scripts/seed-templates.ts
 *
 * 环境变量：
 *   MONGODB_URI - MongoDB 连接字符串（默认 mongodb://localhost:27017/resume-nestjs）
 */

import mongoose, { Schema, Types } from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/resume-nestjs';

/* ------------------------------------------------------------------ */
/*  Schema 定义（与 entities 保持一致）                               */
/* ------------------------------------------------------------------ */

const GlobalStyleSchema = new Schema(
  {
    fontSize: { type: String, default: '14px' },
    moduleMargin: { type: String, default: '14px' },
    pageMargin: { type: String, default: '14px' },
    lineHeight: { type: String, default: '1' },
  },
  { _id: false },
);

const BasicInfoSchema = new Schema(
  {
    name: String,
    gender: String,
    phone: String,
    age: String,
    email: String,
    avatar: String,
    politicalStatus: String,
    workYear: String,
  },
  { _id: false },
);

const JobIntentionSchema = new Schema(
  {
    jobIntention: String,
    intentionCity: String,
    expectationSalary: String,
    entryTime: String,
  },
  { _id: false },
);

const EducationBackgroundSchema = new Schema(
  {
    schoolName: String,
    degree: String,
    major: String,
    enrollmentTime: String,
    graduationTime: String,
    content: String,
    globalSort: { type: Number, default: 0 },
    localSort: { type: Number, default: 0 },
  },
  { _id: false },
);

const WorkExperienceSchema = new Schema(
  {
    companyName: String,
    position: String,
    workTime: String,
    dismissalTime: String,
    workDescription: String,
    globalSort: { type: Number, default: 0 },
    localSort: { type: Number, default: 0 },
  },
  { _id: false },
);

const CampusExperienceSchema = new Schema(
  {
    startTime: String,
    endTime: String,
    title: String,
    description: String,
    content: String,
    globalSort: { type: Number, default: 0 },
    localSort: { type: Number, default: 0 },
  },
  { _id: false },
);

const ProjectExperienceSchema = new Schema(
  {
    startTime: String,
    endTime: String,
    title: String,
    description: String,
    content: String,
    globalSort: { type: Number, default: 0 },
    localSort: { type: Number, default: 0 },
  },
  { _id: false },
);

const InternshipExperienceSchema = new Schema(
  {
    startTime: String,
    endTime: String,
    companyName: String,
    position: String,
    description: String,
    globalSort: { type: Number, default: 0 },
    localSort: { type: Number, default: 0 },
  },
  { _id: false },
);

const SkillsSchema = new Schema(
  {
    content: { type: String, default: '' },
    globalSort: { type: Number, default: 0 },
  },
  { _id: false },
);

const CertificatesSchema = new Schema(
  {
    content: { type: String, default: '' },
    globalSort: { type: Number, default: 0 },
  },
  { _id: false },
);

const SelfEvaluationSchema = new Schema(
  {
    content: { type: String, default: '' },
    globalSort: { type: Number, default: 0 },
  },
  { _id: false },
);

const UserSchema = new Schema(
  {
    username: String,
    email: String,
    password: String,
    loginAttempts: { type: Number, default: 0 },
    createdVia: String,
    oauthProviders: [
      {
        platform: String,
        platformUserId: String,
        accessToken: String,
        refreshToken: String,
        tokenExpiresAt: Date,
        nickname: String,
        avatarUrl: String,
        profileUrl: String,
        email: String,
      },
    ],
  },
  { timestamps: true },
);

const ResumeSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, default: '我的简历' },
    globalStyle: { type: GlobalStyleSchema, default: () => ({}) },
    basicInfo: { type: BasicInfoSchema, default: () => ({}) },
    jobIntention: { type: JobIntentionSchema, default: () => ({}) },
    educationBackground: { type: [EducationBackgroundSchema], default: [] },
    workExperience: { type: [WorkExperienceSchema], default: [] },
    campusExperience: { type: [CampusExperienceSchema], default: [] },
    skills: { type: SkillsSchema, default: () => ({}) },
    certificates: { type: CertificatesSchema, default: () => ({}) },
    projectExperience: { type: [ProjectExperienceSchema], default: [] },
    internshipExperience: { type: [InternshipExperienceSchema], default: [] },
    selfEvaluation: { type: SelfEvaluationSchema, default: () => ({}) },
    isTemplate: { type: Boolean, default: false },
    cover: { type: String, default: '' },
    type: { type: String, default: 'default' },
  },
  { timestamps: true },
);

const TemplateSchema = new Schema(
  {
    name: { type: String, required: true },
    previewImage: String,
    category: { type: String, required: true },
    usedCount: { type: Number, default: 0 },
    resume: { type: Schema.Types.ObjectId, ref: 'Resume', required: true },
    resumeId: { type: String, required: true },
    userId: { type: String, required: true },
  },
  { timestamps: true },
);

/* ------------------------------------------------------------------ */
/*  模板数据                                                          */
/* ------------------------------------------------------------------ */

interface TemplateSeedData {
  name: string;
  category: string;
  previewImage: string;
  resume: {
    title: string;
    type: string;
    cover: string;
    basicInfo: Record<string, string>;
    jobIntention: Record<string, string>;
    educationBackground: Record<string, string>[];
    workExperience: Record<string, string>[];
    projectExperience: Record<string, string>[];
    campusExperience?: Record<string, string>[];
    internshipExperience?: Record<string, string>[];
    skills: { content: string };
    selfEvaluation: { content: string };
  };
}

const templates: TemplateSeedData[] = [
  {
    name: '前端开发工程师模板',
    category: '前端开发',
    previewImage: '/uploads/templates/frontend-dev.png',
    resume: {
      title: '前端开发工程师简历',
      type: 'frontend',
      cover: '',
      basicInfo: {
        name: '张三',
        gender: '男',
        phone: '13800138001',
        age: '25',
        email: 'zhangsan@example.com',
        politicalStatus: '群众',
        workYear: '3年',
      },
      jobIntention: {
        jobIntention: '前端开发工程师',
        intentionCity: '北京',
        expectationSalary: '20-30K',
        entryTime: '随时到岗',
      },
      educationBackground: [
        {
          schoolName: '北京大学',
          degree: '本科',
          major: '计算机科学与技术',
          enrollmentTime: '2017-09',
          graduationTime: '2021-06',
          content: 'GPA 3.8/4.0，获得校级奖学金',
        },
      ],
      workExperience: [
        {
          companyName: '字节跳动',
          position: '前端开发工程师',
          workTime: '2021-07',
          dismissalTime: '至今',
          workDescription:
            '负责抖音 Web 端核心功能开发，使用 React + TypeScript 技术栈，参与性能优化，首屏加载时间降低 40%',
        },
      ],
      projectExperience: [
        {
          startTime: '2022-03',
          endTime: '2022-12',
          title: '抖音创作者平台',
          description: '面向内容创作者的数据分析和管理平台',
          content:
            '独立负责前端架构设计和核心模块开发，使用 Next.js + Ant Design，日活用户 10 万+',
        },
      ],
      skills: {
        content:
          '熟练掌握 React、Vue、TypeScript；熟悉 Node.js、Webpack、Vite；了解 Docker、CI/CD',
      },
      selfEvaluation: {
        content:
          '3 年前端开发经验，具备扎实的计算机基础和良好的编码习惯，热爱开源社区',
      },
    },
  },
  {
    name: '后端开发工程师模板',
    category: '后端开发',
    previewImage: '/uploads/templates/backend-dev.png',
    resume: {
      title: '后端开发工程师简历',
      type: 'backend',
      cover: '',
      basicInfo: {
        name: '李四',
        gender: '男',
        phone: '13800138002',
        age: '28',
        email: 'lisi@example.com',
        politicalStatus: '党员',
        workYear: '5年',
      },
      jobIntention: {
        jobIntention: '后端开发工程师',
        intentionCity: '上海',
        expectationSalary: '30-45K',
        entryTime: '两周内到岗',
      },
      educationBackground: [
        {
          schoolName: '清华大学',
          degree: '硕士',
          major: '软件工程',
          enrollmentTime: '2016-09',
          graduationTime: '2019-06',
          content: '研究方向：分布式系统，发表 SCI 论文 2 篇',
        },
        {
          schoolName: '浙江大学',
          degree: '本科',
          major: '计算机科学与技术',
          enrollmentTime: '2012-09',
          graduationTime: '2016-06',
          content: 'GPA 3.9/4.0，ACM 竞赛银牌',
        },
      ],
      workExperience: [
        {
          companyName: '阿里巴巴',
          position: '高级后端工程师',
          workTime: '2019-07',
          dismissalTime: '至今',
          workDescription:
            '负责淘宝核心交易系统架构设计和开发，使用 Java + Spring Cloud 技术栈，支撑日均亿级交易量',
        },
      ],
      projectExperience: [
        {
          startTime: '2020-01',
          endTime: '2021-06',
          title: '淘宝订单系统重构',
          description: '将单体应用拆分为微服务架构',
          content:
            '主导订单系统微服务化改造，引入分布式事务解决方案，系统可用性从 99.9% 提升到 99.99%',
        },
      ],
      skills: {
        content:
          '精通 Java、Spring Boot/Cloud、MySQL、Redis；熟悉 Kafka、Elasticsearch、Docker、Kubernetes',
      },
      selfEvaluation: {
        content:
          '5 年后端开发经验，具备大型分布式系统设计能力，对高并发、高可用架构有深入理解',
      },
    },
  },
  {
    name: 'UI/UX 设计师模板',
    category: 'UI设计',
    previewImage: '/uploads/templates/ui-designer.png',
    resume: {
      title: 'UI/UX 设计师简历',
      type: 'design',
      cover: '',
      basicInfo: {
        name: '王五',
        gender: '女',
        phone: '13800138003',
        age: '26',
        email: 'wangwu@example.com',
        politicalStatus: '群众',
        workYear: '4年',
      },
      jobIntention: {
        jobIntention: 'UI/UX 设计师',
        intentionCity: '深圳',
        expectationSalary: '25-35K',
        entryTime: '一个月内到岗',
      },
      educationBackground: [
        {
          schoolName: '中央美术学院',
          degree: '本科',
          major: '数字媒体艺术',
          enrollmentTime: '2016-09',
          graduationTime: '2020-06',
          content: '获得多项设计竞赛奖项',
        },
      ],
      workExperience: [
        {
          companyName: '腾讯',
          position: 'UI/UX 设计师',
          workTime: '2020-07',
          dismissalTime: '至今',
          workDescription:
            '负责微信小程序设计系统建设，主导多个 B 端产品 UI 设计，用户满意度提升 30%',
        },
      ],
      projectExperience: [
        {
          startTime: '2021-03',
          endTime: '2022-06',
          title: '微信小程序设计系统',
          description: '建立统一的小程序 UI 设计规范和组件库',
          content:
            '独立完成设计系统搭建，包含 100+ 组件，被 5000+ 小程序采用，获得公司设计金奖',
        },
      ],
      skills: {
        content:
          '精通 Figma、Sketch、Adobe XD；熟悉 HTML/CSS、React；具备良好的审美和用户体验意识',
      },
      selfEvaluation: {
        content:
          '4 年 UI/UX 设计经验，具备出色的视觉设计能力和用户研究能力，注重设计与业务的结合',
      },
    },
  },
  {
    name: '产品经理模板',
    category: '产品经理',
    previewImage: '/uploads/templates/product-manager.png',
    resume: {
      title: '产品经理简历',
      type: 'product',
      cover: '',
      basicInfo: {
        name: '赵六',
        gender: '男',
        phone: '13800138004',
        age: '30',
        email: 'zhaoliu@example.com',
        politicalStatus: '群众',
        workYear: '7年',
      },
      jobIntention: {
        jobIntention: '高级产品经理',
        intentionCity: '杭州',
        expectationSalary: '40-60K',
        entryTime: '随时到岗',
      },
      educationBackground: [
        {
          schoolName: '复旦大学',
          degree: '本科',
          major: '工商管理',
          enrollmentTime: '2013-09',
          graduationTime: '2017-06',
          content: '辅修计算机科学',
        },
      ],
      workExperience: [
        {
          companyName: '美团',
          position: '高级产品经理',
          workTime: '2019-03',
          dismissalTime: '至今',
          workDescription:
            '负责外卖业务核心产品设计，主导多个千万级 DAU 产品功能迭代，GMV 提升 25%',
        },
        {
          companyName: '京东',
          position: '产品经理',
          workTime: '2017-07',
          dismissalTime: '2019-02',
          workDescription: '负责电商搜索推荐产品，优化搜索算法，转化率提升 15%',
        },
      ],
      projectExperience: [
        {
          startTime: '2020-06',
          endTime: '2021-12',
          title: '美团外卖会员体系',
          description: '从 0 到 1 搭建会员体系',
          content:
            '主导会员体系产品设计，上线后会员用户复购率提升 40%，贡献 GMV 增长 15%',
        },
      ],
      skills: {
        content:
          '精通 Axure、墨刀、Figma；熟悉 SQL、Python 数据分析；具备优秀的逻辑思维和沟通能力',
      },
      selfEvaluation: {
        content:
          '7 年产品经验，具备从 0 到 1 的产品搭建能力和数据驱动的决策思维，擅长跨部门协作',
      },
    },
  },
  {
    name: '应届毕业生模板',
    category: '应届生',
    previewImage: '/uploads/templates/fresh-graduate.png',
    resume: {
      title: '应届毕业生简历',
      type: 'freshgraduate',
      cover: '',
      basicInfo: {
        name: '孙七',
        gender: '女',
        phone: '13800138005',
        age: '22',
        email: 'sunqi@example.com',
        politicalStatus: '团员',
        workYear: '应届',
      },
      jobIntention: {
        jobIntention: 'Java 开发工程师',
        intentionCity: '广州',
        expectationSalary: '12-18K',
        entryTime: '随时到岗',
      },
      educationBackground: [
        {
          schoolName: '中山大学',
          degree: '本科',
          major: '软件工程',
          enrollmentTime: '2020-09',
          graduationTime: '2024-06',
          content:
            'GPA 3.7/4.0，获国家奖学金，ACM 校赛一等奖，发表 EI 论文 1 篇',
        },
      ],
      workExperience: [],
      internshipExperience: [
        {
          startTime: '2023-07',
          endTime: '2023-12',
          companyName: '腾讯',
          position: '后端开发实习生',
          description:
            '参与微信支付后端开发，使用 Go 语言，负责订单查询接口优化，QPS 提升 50%',
        },
      ],
      projectExperience: [
        {
          startTime: '2023-03',
          endTime: '2023-06',
          title: '校园二手交易平台',
          description: '独立开发的校园二手交易小程序',
          content:
            '使用 Spring Boot + Vue 3 技术栈，实现商品发布、搜索、聊天等功能，上线后获得 2000+ 用户',
        },
      ],
      skills: {
        content:
          '熟悉 Java、Spring Boot、MySQL、Redis；了解 Go、Docker、Linux；通过 CET-6',
      },
      selfEvaluation: {
        content:
          '应届毕业生，具备扎实的编程基础和良好的学习能力，热爱技术，积极参与开源项目',
      },
    },
  },
];

/* ------------------------------------------------------------------ */
/*  主函数                                                            */
/* ------------------------------------------------------------------ */

async function seed() {
  console.log('🚀 开始种子数据初始化...');
  console.log(`📦 连接数据库: ${MONGODB_URI}`);

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ 数据库连接成功');

    const UserModel = mongoose.model('User', UserSchema);
    const ResumeModel = mongoose.model('Resume', ResumeSchema);
    const TemplateModel = mongoose.model('Template', TemplateSchema);

    // 查询真实用户
    const user = await UserModel.findOne().lean();
    if (!user) {
      console.error('❌ 数据库中没有用户，请先创建用户');
      await mongoose.disconnect();
      process.exit(1);
    }
    console.log(`👤 使用用户: ${user.email || user.username} (${user._id})`);

    // 检查是否已有模板数据
    const existingCount = await TemplateModel.countDocuments();
    if (existingCount > 0) {
      console.log(`⚠️  数据库中已存在 ${existingCount} 条模板数据`);
      const answer = await prompt('是否清空后重新导入？(y/N): ');
      if (answer?.toLowerCase() !== 'y') {
        console.log('❌ 已取消操作');
        await mongoose.disconnect();
        return;
      }
      // 清空现有数据
      await TemplateModel.deleteMany({});
      await ResumeModel.deleteMany({ isTemplate: true });
      console.log('🗑️  已清空现有模板数据');
    }

    let createdCount = 0;

    for (const tpl of templates) {
      // 1. 创建 Resume 文档
      const resume = await ResumeModel.create({
        userId: user._id.toString(),
        user: user._id,
        title: tpl.resume.title,
        type: tpl.resume.type,
        cover: tpl.resume.cover,
        isTemplate: true,
        basicInfo: tpl.resume.basicInfo,
        jobIntention: tpl.resume.jobIntention,
        educationBackground: tpl.resume.educationBackground,
        workExperience: tpl.resume.workExperience,
        projectExperience: tpl.resume.projectExperience,
        campusExperience: tpl.resume.campusExperience || [],
        internshipExperience: tpl.resume.internshipExperience || [],
        skills: tpl.resume.skills,
        selfEvaluation: tpl.resume.selfEvaluation,
      });

      // 2. 创建 Template 文档
      await TemplateModel.create({
        name: tpl.name,
        category: tpl.category,
        previewImage: tpl.previewImage,
        usedCount: 0,
        resume: resume._id,
        resumeId: resume._id.toString(),
        userId: user._id.toString(),
      });

      createdCount++;
      console.log(
        `✅ [${createdCount}/${templates.length}] 创建模板: ${tpl.name}`,
      );
    }

    console.log('\n🎉 种子数据初始化完成！');
    console.log(`📊 共创建 ${createdCount} 个简历模板`);
    console.log('\n模板列表：');

    const allTemplates = await TemplateModel.find().lean();
    allTemplates.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.name} (${t.category})`);
    });
  } catch (error) {
    console.error('❌ 种子数据初始化失败:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 数据库连接已关闭');
  }
}

/* ------------------------------------------------------------------ */
/*  辅助函数                                                          */
/* ------------------------------------------------------------------ */

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.setEncoding('utf-8');
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim());
    });
  });
}

// 运行种子脚本
seed();
