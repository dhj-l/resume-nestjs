/**
 * 远程服务器种子数据脚本（丰富版）
 * 1. 创建 admin 用户（如不存在）
 * 2. 清空旧模板 → 创建 5 个内容丰富的简历模板
 *
 * 使用方式:
 *   cd /opt/ai-resume && npx ts-node --project tsconfig.scripts.json scripts/seed-remote.ts
 */

import mongoose, { Schema } from 'mongoose';
import * as bcrypt from 'bcrypt';

const MONGODB_URI = 'mongodb://127.0.0.1:27017/ai-resume';
const ADMIN_USER = { username: 'admin', email: 'admin@ai-resume.com' };
const ADMIN_PASSWORD = 'Admin123!@#';

/* ------------------------------------------------------------------ */
/*  Schema                                                             */
/* ------------------------------------------------------------------ */

const GlobalStyleSchema = new Schema({ fontSize: String, moduleMargin: String, pageMargin: String, lineHeight: String }, { _id: false });
const BasicInfoSchema = new Schema({ name: String, gender: String, phone: String, age: String, email: String, avatar: String, politicalStatus: String, workYear: String }, { _id: false });
const JobIntentionSchema = new Schema({ jobIntention: String, intentionCity: String, expectationSalary: String, entryTime: String }, { _id: false });
const EduSchema = new Schema({ schoolName: String, degree: String, major: String, enrollmentTime: String, graduationTime: String, content: String, globalSort: Number, localSort: Number }, { _id: false });
const WorkSchema = new Schema({ companyName: String, position: String, workTime: String, dismissalTime: String, workDescription: String, globalSort: Number, localSort: Number }, { _id: false });
const ProjSchema = new Schema({ startTime: String, endTime: String, title: String, description: String, content: String, globalSort: Number, localSort: Number }, { _id: false });
const InternSchema = new Schema({ startTime: String, endTime: String, companyName: String, position: String, description: String, globalSort: Number, localSort: Number }, { _id: false });
const CampusSchema = new Schema({ startTime: String, endTime: String, title: String, description: String, content: String, globalSort: Number, localSort: Number }, { _id: false });
const SkillsSchema = new Schema({ content: String, globalSort: Number }, { _id: false });
const SelfEvalSchema = new Schema({ content: String, globalSort: Number }, { _id: false });

const UserSchema = new Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: String, loginAttempts: { type: Number, default: 0 },
  createdVia: { type: String, default: 'email' },
  oauthProviders: [{
    platform: String, platformUserId: String, accessToken: String,
    refreshToken: String, tokenExpiresAt: Date, nickname: String,
    avatarUrl: String, profileUrl: String, email: String,
  }],
}, { timestamps: true });

const ResumeSchema = new Schema({
  userId: { type: String, required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, default: '我的简历' },
  globalStyle: { type: GlobalStyleSchema, default: () => ({}) },
  basicInfo: { type: BasicInfoSchema, default: () => ({}) },
  jobIntention: { type: JobIntentionSchema, default: () => ({}) },
  educationBackground: { type: [EduSchema], default: [] },
  workExperience: { type: [WorkSchema], default: [] },
  campusExperience: { type: [CampusSchema], default: [] },
  skills: { type: SkillsSchema, default: () => ({}) },
  certificates: { type: SkillsSchema, default: () => ({}) },
  projectExperience: { type: [ProjSchema], default: [] },
  internshipExperience: { type: [InternSchema], default: [] },
  selfEvaluation: { type: SelfEvalSchema, default: () => ({}) },
  isTemplate: { type: Boolean, default: false },
  cover: { type: String, default: '' },
  type: { type: String, default: 'default' },
}, { timestamps: true });

const TemplateSchema = new Schema({
  name: { type: String, required: true },
  previewImage: String,
  category: { type: String, required: true },
  usedCount: { type: Number, default: 0 },
  resume: { type: Schema.Types.ObjectId, ref: 'Resume', required: true },
  resumeId: { type: String, required: true },
  userId: { type: String, required: true },
}, { timestamps: true });

/* ================================================================== */
/*  丰富模板数据                                                        */
/* ================================================================== */

const templates = [
  // ═══ 1. 前端开发工程师 ═══
  {
    name: '前端开发工程师模板',
    category: '前端开发',
    previewImage: '',
    resume: {
      title: '前端开发工程师简历',
      type: 'frontend',
      cover: '',
      basicInfo: { name: '张三', gender: '男', phone: '138****8001', age: '25', email: 'zhangsan@example.com', politicalStatus: '群众', workYear: '3年' },
      jobIntention: { jobIntention: '高级前端开发工程师', intentionCity: '北京', expectationSalary: '25-40K', entryTime: '两周内到岗' },
      educationBackground: [
        { schoolName: '北京大学', degree: '本科', major: '计算机科学与技术', enrollmentTime: '2017-09', graduationTime: '2021-06', content: 'GPA 3.8/4.0，获校级一等奖学金 2 次，优秀毕业生荣誉。主修课程：数据结构与算法、操作系统、计算机网络、编译原理、软件工程。' },
      ],
      workExperience: [
        { companyName: '字节跳动', position: '前端开发工程师', workTime: '2023-03', dismissalTime: '至今', workDescription: '负责抖音创作者服务平台前端架构设计与核心模块开发，使用 React 18 + TypeScript + Zustand 技术栈。主导了微前端架构改造，将巨石应用拆分为 8 个独立子应用，构建时间缩短 60%，团队协作效率显著提升。设计实现了通用组件库，包含 50+ 高质量组件，被部门 3 个产品线复用。优化首屏加载性能，通过代码分割、图片懒加载、CDN 预热等手段将 LCP 从 4.2s 降至 1.8s。' },
        { companyName: '美团', position: '初级前端开发工程师', workTime: '2021-07', dismissalTime: '2023-02', workDescription: '参与美团外卖商家端 H5 和 PC 管理后台开发。负责订单管理模块、商品管理模块的前端实现。使用 Vue 2 + Element UI 技术栈，独立完成了 5 个核心业务模块的迭代开发。引入 E2E 测试框架 Cypress，编写 200+ 测试用例，线上 Bug 率下降 50%。参与 Webpack 构建优化，将打包体积减少 35%，构建时间缩短 40%。' },
      ],
      projectExperience: [
        { startTime: '2023-06', endTime: '2024-01', title: '创作者平台微前端架构升级', description: '将单体前端应用拆分为微前端架构，提升多团队协作效率', content: '作为核心开发者，主导了基于 qiankun 的微前端架构方案设计。分析现有巨石应用的模块依赖关系，制定拆分策略和迁移计划。独立完成了基座应用和 3 个子应用的开发，实现了主子应用间的通信机制、公共依赖共享和样式隔离。迁移后各子应用可独立构建部署，迭代周期从 2 周缩短到 3 天。产出微前端接入文档和最佳实践，指导其他团队成员快速上手。' },
        { startTime: '2022-01', endTime: '2022-10', title: '商家端组件库建设', description: '从零搭建美团外卖商家端通用组件库', content: '分析和梳理各业务线通用 UI 模式，设计组件 API 规范。使用 Vue 2 + Rollup 技术栈，开发了 Table、Form、Chart 等 30+ 业务组件。实现了按需加载、主题定制、国际化等高级特性。编写 Storybook 文档和单元测试，保证组件质量。组件库在部门内推广后，新项目开发效率提升 40%，UI 一致性提升显著。' },
        { startTime: '2021-09', endTime: '2021-12', title: '前端监控告警平台', description: '搭建前端异常监控和性能分析平台', content: '使用 Sentry 自建前端异常监控系统，接入 5 个前端项目。自定义错误上报策略，实现 SourceMap 上传和反解析。搭建性能监控看板，实时追踪 FCP、LCP、TTI 等核心 Web Vitals 指标。配置钉钉告警通知，关键异常 5 分钟内响应。上线后平均故障发现时间从 30 分钟降至 5 分钟。' },
      ],
      skills: { content: '精通 React、Vue、TypeScript、JavaScript ES6+；熟悉 Next.js、Nuxt.js 等 SSR 框架；深入理解 Webpack、Vite、Rollup 等构建工具；熟练使用 Zustand、Pinia、Redux 等状态管理库；熟悉 Node.js、Express、NestJS 服务端开发；掌握 MongoDB、MySQL 数据库基本操作；熟练使用 Git、CI/CD、Docker；了解性能优化、前端安全、微前端架构、WebAssembly；具备良好的代码规范意识和 Code Review 能力。' },
      selfEvaluation: { content: '3 年前端开发经验，具备扎实的计算机科学基础和良好的编程习惯。热爱技术，持续关注前端发展趋势，习惯阅读源码和参与开源社区。在字节跳动期间主导了微前端架构升级，积累了大型前端项目的架构设计和工程化实践经验。擅长性能优化和用户体验改进，能够从数据和用户反馈出发推动产品迭代。具备良好的沟通协作能力和团队领导力，能够独立承担项目并推动落地。期望加入一个技术氛围浓厚、有挑战性的团队，持续成长。' },
    },
  },

  // ═══ 2. 后端开发工程师 ═══
  {
    name: '后端开发工程师模板',
    category: '后端开发',
    previewImage: '',
    resume: {
      title: '后端开发工程师简历',
      type: 'backend',
      cover: '',
      basicInfo: { name: '李四', gender: '男', phone: '138****8002', age: '28', email: 'lisi@example.com', politicalStatus: '党员', workYear: '5年' },
      jobIntention: { jobIntention: '高级后端开发工程师/技术专家', intentionCity: '上海', expectationSalary: '35-50K', entryTime: '一个月内到岗' },
      educationBackground: [
        { schoolName: '清华大学', degree: '硕士', major: '软件工程', enrollmentTime: '2016-09', graduationTime: '2019-06', content: '研究方向：分布式系统与中间件。发表 SCI 二区论文 2 篇（第一作者），EI 会议论文 1 篇。获国家奖学金。导师：王XX教授（IEEE Fellow）。' },
        { schoolName: '浙江大学', degree: '本科', major: '计算机科学与技术', enrollmentTime: '2012-09', graduationTime: '2016-06', content: 'GPA 3.9/4.0，专业排名前 5%。ACM-ICPC 亚洲区域赛银牌。获竺可桢奖学金。' },
      ],
      workExperience: [
        { companyName: '阿里巴巴（淘宝事业部）', position: '高级后端开发工程师', workTime: '2021-07', dismissalTime: '至今', workDescription: '负责淘宝核心交易链路（下单、支付、履约）的后端架构设计与开发。主导了交易系统异地多活架构改造，系统可用性从 99.97% 提升至 99.995%。设计实现了分布式事务最终一致性方案，解决跨机房数据同步延迟问题，日均处理订单 5000 万+。2024 年双十一大促期间作为交易链路值守负责人，峰值 QPS 达 85 万，系统零故障。培养 3 名校招生，辅导其快速成长为团队骨干。' },
        { companyName: '华为（Cloud BU）', position: '后端开发工程师', workTime: '2019-07', dismissalTime: '2021-06', workDescription: '参与华为云分布式数据库 TaurusDB 的内核开发。负责查询优化器模块，改进了基于代价的 Join 顺序选择算法，复杂查询性能平均提升 30%。实现了并行查询执行引擎，支持多核并行扫描和聚合计算，TPC-H 测试中 QphH 提升 2.5 倍。参与数据库内核开源社区贡献，提交 Patch 10+。' },
      ],
      projectExperience: [
        { startTime: '2023-01', endTime: '2024-06', title: '交易系统异地多活架构升级', description: '实现核心交易系统的跨地域多活部署，支持故障自动切换', content: '作为项目技术负责人，主导整体技术方案设计。设计了三数据中心流量调度策略，基于用户地域就近接入。实现了基于 MySQL Binlog 的异步数据同步方案，跨机房延迟控制在 50ms 以内。开发了全局分布式 ID 生成器，保证多机房数据唯一性。设计了故障检测和自动切换机制，单机房故障时流量自动迁移，切换时间 < 30 秒。项目上线后全年服务 SLA 从 99.97% 提升至 99.995%，为公司节省机房容灾成本约 2000 万元/年。获得 2023 年淘宝技术部年度最佳项目奖。' },
        { startTime: '2022-03', endTime: '2022-12', title: '分布式事务框架 Seata-AT 优化', description: '优化开源分布式事务框架，提升性能和易用性', content: '深入分析了 Seata AT 模式的实现原理和性能瓶颈。优化了全局锁的获取和释放逻辑，将事务并发度提升 3 倍。改进了 undo log 的存储格式和清理机制，存储空间占用减少 60%。增加了 Spring Boot Starter 自动配置功能，简化接入流程。将优化后的方案在淘宝订单系统中落地实践，分布式事务 RT 降低 40%。相关改进贡献给开源社区，被合并到 Seata 1.6 版本。' },
        { startTime: '2020-06', endTime: '2021-05', title: 'TaurusDB 并行查询引擎', description: '为华为云分布式数据库开发并行查询能力', content: '独立设计和实现了并行查询执行框架。基于 Volcano 模型的算子并行化，支持并行扫描、并行聚合、并行 Join。设计了智能并行度决策算法，根据表大小和 CPU 核心数自动调整并行度。通过 TPC-H 基准测试验证，22 条查询平均性能提升 2.5 倍。编写了完整的设计文档和性能测试报告，产出专利 2 篇。' },
      ],
      skills: { content: '精通 Java、Go 语言；深入理解 Spring Boot/Cloud、MyBatis、Netty 等主流框架；熟悉 MySQL 索引优化、SQL 调优，理解 InnoDB 存储引擎原理；精通 Redis 集群、哨兵模式及缓存策略设计；熟悉 Kafka、RocketMQ 消息队列原理与最佳实践；掌握 Docker、Kubernetes 容器编排；熟悉 Elasticsearch 搜索引擎；了解 Hadoop、Flink 大数据技术栈；具备大规模分布式系统设计和高并发调优经验；熟悉领域驱动设计（DDD）和微服务架构模式。' },
      selfEvaluation: { content: '5 年后端开发经验，具备扎实的计算机理论基础和丰富的工程实践经验。在阿里巴巴期间深度参与了核心交易系统的架构演进，对高并发、高可用、分布式一致性等关键技术挑战有深入理解和实战经验。技术视野开阔，不仅局限于上层业务开发，对数据库内核、分布式中间件等底层技术也有深入研究。具备良好的系统设计能力，能从全局视角权衡技术方案。热衷于技术分享，在团队内做过 10+ 次技术分享。期望在一个技术驱动、有挑战性的平台继续深耕，成长为领域专家。' },
    },
  },

  // ═══ 3. UI/UX 设计师 ═══
  {
    name: 'UI/UX 设计师模板',
    category: 'UI设计',
    previewImage: '',
    resume: {
      title: 'UI/UX 设计师简历',
      type: 'design',
      cover: '',
      basicInfo: { name: '王五', gender: '女', phone: '138****8003', age: '26', email: 'wangwu@example.com', politicalStatus: '群众', workYear: '4年' },
      jobIntention: { jobIntention: '高级 UI/UX 设计师', intentionCity: '深圳', expectationSalary: '25-40K', entryTime: '一个月内到岗' },
      educationBackground: [
        { schoolName: '中央美术学院', degree: '本科', major: '数字媒体艺术', enrollmentTime: '2016-09', graduationTime: '2020-06', content: 'GPA 3.8/4.0，获国家奖学金 1 次。毕业设计《未来城市交互界面》获学院优秀毕业设计奖。选修交互设计、用户心理学、信息可视化等课程。' },
      ],
      workExperience: [
        { companyName: '腾讯（微信事业群）', position: '高级 UI/UX 设计师', workTime: '2022-03', dismissalTime: '至今', workDescription: '负责微信小程序设计系统的建设与维护，为微信生态内 300 万+ 小程序提供设计规范。主导了 WeUI 2.0 设计语言升级，从视觉风格到交互模式进行了全面革新。为微信支付、腾讯文档、企业微信等重量级 B 端产品提供设计支持。推动设计系统的工程化，建立了 Design Token 体系，打通设计与开发协作流程，设计稿到代码的还原度从 70% 提升到 95%+。主导用户研究工作，通过可用性测试和 A/B 测试持续优化产品体验，核心流程转化率提升 18%。' },
        { companyName: '网易（云音乐事业部）', position: 'UI 设计师', workTime: '2020-07', dismissalTime: '2022-02', workDescription: '负责网易云音乐移动端和 PC 端多个核心功能模块的 UI 设计。主导了播放器 8.0 版本视觉改版，全新设计了播放页、歌词页和专辑页。设计云音乐直播功能的整体 UI，上线后直播间 DAU 突破 100 万。参与设计系统的搭建，输出 60+ UI 组件规范。与产品和开发紧密协作，推动设计方案高质量落地。设计作品多次入选站酷、UI 中国首页推荐。' },
      ],
      projectExperience: [
        { startTime: '2023-06', endTime: '2024-03', title: 'WeUI 2.0 设计语言升级', description: '微信小程序设计系统的重大版本升级，覆盖设计语言和组件库', content: '作为项目设计负责人，主导了从前期调研到最终落地的全流程。研究分析了 Material Design 3、Ant Design 5 等行业前沿设计系统的发展趋势。提出了"轻量、包容、高效"的设计理念，重新定义了色彩系统（含暗黑模式）、字体层级、间距系统和圆角规范。新增了 80+ 功能组件，覆盖表单、导航、数据展示、反馈等场景。建立了完善的可访问性设计规范，确保 WCAG 2.1 AA 级合规。项目上线后被微信公开课作为最佳实践案例分享，设计规范文档累计阅读量 50 万+。' },
        { startTime: '2022-09', endTime: '2023-04', title: '微信支付商户管理后台改版', description: '面向商家的 B 端管理工具的全面体验升级', content: '独立完成了从用户调研到设计交付的全流程。通过深度访谈 15 位商家和问卷调查 500+ 样本，梳理了现有后台的核心痛点：信息层级混乱、操作路径过长、新手引导缺失。重新设计了信息架构，采用卡片式布局和渐进式信息披露策略。优化了收款、退款、账单等高频操作流程，操作步骤平均减少 40%。新增了数据可视化仪表盘，帮助商家快速了解经营状况。上线后商家满意度 NPS 从 32 分提升至 58 分。' },
        { startTime: '2021-03', endTime: '2021-09', title: '网易云音乐播放器 8.0 改版', description: '网易云音乐核心功能的视觉和交互升级', content: '设计了全新的播放页交互方案，采用卡片叠加式布局提升单手操作便利性。重新设计了歌词动效，支持逐字高亮和滚动歌词两种模式。优化了播放列表管理逻辑，支持拖拽排序和批量操作。设计稿在站酷获得 2 万+ 浏览和 1000+ 点赞。' },
      ],
      skills: { content: '精通 Figma（包括 Auto Layout、Component Properties、Variables 等高级功能）；熟练使用 Sketch、Adobe XD、Principle、After Effects；掌握 HTML/CSS 基础，能与前端高效协作；熟悉 Design Token 和设计工程化实践；具备用户研究方法论（深度访谈、可用性测试、问卷调研、A/B 测试）；熟悉 Material Design、Human Interface Guidelines 等平台设计规范；了解前端框架 React/Vue 的基本概念；具备数据可视化设计经验；良好的动效设计能力；熟练使用 Notion、Figma Jam 等协作工具。' },
      selfEvaluation: { content: '4 年 UI/UX 设计经验，兼具视觉表现力和用户思维。在腾讯期间主导了 WeUI 2.0 设计语言升级，积累了复杂设计系统的构建和推广经验。擅长 B 端产品设计，对信息架构、数据可视化、企业级组件的设计有深入理解。注重设计与工程的结合，推动 Design Token 和设计规范落地。具备较强的用户研究能力，习惯用数据驱动设计决策。关注设计趋势，对 AI 与设计的结合有持续探索。期望在一个重视设计价值的团队中，做出对用户有真正影响力的产品。' },
    },
  },

  // ═══ 4. 产品经理 ═══
  {
    name: '产品经理模板',
    category: '产品经理',
    previewImage: '',
    resume: {
      title: '产品经理简历',
      type: 'product',
      cover: '',
      basicInfo: { name: '赵六', gender: '男', phone: '138****8004', age: '30', email: 'zhaoliu@example.com', politicalStatus: '群众', workYear: '7年' },
      jobIntention: { jobIntention: '高级产品经理/产品总监', intentionCity: '杭州', expectationSalary: '40-60K', entryTime: '随时到岗' },
      educationBackground: [
        { schoolName: '复旦大学', degree: '硕士', major: '工商管理（MBA）', enrollmentTime: '2019-09', graduationTime: '2021-06', content: 'GPA 3.7/4.0。研究方向：互联网产品战略。主导的"社区团购用户增长策略研究"获优秀毕业论文。在校期间创业项目获复旦创业大赛银奖。' },
        { schoolName: '华中科技大学', degree: '本科', major: '信息管理与信息系统', enrollmentTime: '2013-09', graduationTime: '2017-06', content: 'GPA 3.5/4.0。辅修计算机科学。获优秀学生干部称号。' },
      ],
      workExperience: [
        { companyName: '美团（到家事业群）', position: '高级产品经理', workTime: '2021-07', dismissalTime: '至今', workDescription: '负责美团外卖用户增长与会员体系产品。主导了外卖会员体系 2.0 版本的从零到一搭建，会员用户规模从 200 万增长到 1500 万。负责外卖首页推荐策略优化，核心指标（CTR、CVR、GMV）均有显著提升。管理 5 人产品团队，制定季度 OKR 和产品路线图。推动产品与算法、运营、商分团队的深度协作机制，建立数据驱动决策文化。2024 年负责的会员增长项目获事业部年度最佳项目。' },
        { companyName: '京东（零售子集团）', position: '产品经理', workTime: '2019-03', dismissalTime: '2021-06', workDescription: '负责京东 App 搜索推荐产品。主导了搜索排序策略的迭代，引入了个性化因子和实时行为信号，搜索结果 CTR 提升 15%，转化率提升 12%。设计了智能搜索联想（Query Suggestion）功能，日均使用用户 2000 万+。推动搜索与推荐场景的联动，在搜索结果页引入个性化推荐模块，提升连带购买率 8%。获得 2020 年京东零售优秀产品经理。' },
        { companyName: '滴滴出行', position: '助理产品经理', workTime: '2017-07', dismissalTime: '2019-02', workDescription: '负责滴滴出行 App 司机端产品，包括接单流程、收入管理、热力图等功能模块。主导了司机端 5.0 版本改版，重新设计信息架构和核心操作流程。优化了司机接单体验，司机端接单成功率提升 5 个百分点。参与拼车业务的产品策划，撰写 MRD 和 PRD 文档。作为新人获得部门最佳潜力奖。' },
      ],
      projectExperience: [
        { startTime: '2023-01', endTime: '2024-03', title: '美团外卖会员体系 2.0', description: '从零搭建会员产品，实现千万级用户增长', content: '作为项目负责人，从市场调研、竞品分析到产品设计全面牵头。调研了 Amazon Prime、Costco 会员、京东 PLUS 等国内外标杆会员模式。设计了分层会员体系（白银/黄金/钻石），不同等级享有差异化权益（免配送费、专属折扣、生日特权等）。建立了会员积分和成长值体系，增强用户粘性和复购意愿。设计 A/B 实验方案，通过 6 轮迭代验证和优化权益组合。与运营团队配合设计了拉新、促活、召回的全链路运营策略。上线后会员用户规模突破 1500 万，会员月均下单频次是非会员的 2.3 倍，贡献 GMV 占比 35%。项目 ROI 为 1:4.8，获 2024 年事业部年度最佳项目奖。' },
        { startTime: '2022-05', endTime: '2022-12', title: '外卖首页个性化推荐升级', description: '基于用户画像和实时行为优化首页内容排序', content: '设计了融合多维度信号的推荐策略框架，包括用户长期偏好、短期行为、场景特征、商品属性等。与算法团队合作优化了深度学习推荐模型，引入 Multi-Task Learning 同时预估 CTR 和 CVR。重新设计了首页的模块化布局，支持不同用户看到不同的模块组合和排序。建立了推荐效果监控体系，实时追踪曝光、点击、转化漏斗。项目上线后首页 CTR 提升 22%，人均浏览商户数提升 18%，下单转化率提升 15%。' },
        { startTime: '2020-01', endTime: '2020-09', title: '京东搜索智能化升级', description: '引入自然语言处理和个性化技术优化搜索体验', content: '分析了用户搜索行为的完整链路，识别出查询意图理解弱、结果排序粗放等核心问题。与 NLP 团队合作引入 BERT 模型进行 Query 意图分类和实体识别，长尾查询的召回率提升 25%。优化了搜索排序策略，结合用户历史行为和实时上下文进行个性化排序。上线后搜索结果页 CTR 提升 15%，零结果率从 8% 降至 3%，搜索到下单转化率提升 12%。该项目入选 2020 年京东技术年度案例。' },
      ],
      skills: { content: '精通产品全生命周期管理：市场调研 → 需求分析 → PRD 撰写 → 项目推进 → 数据分析 → 迭代优化；熟练使用 Axure、墨刀、Figma 进行产品原型设计；精通 SQL 数据分析，熟练使用 Python 进行数据挖掘和可视化；熟悉 A/B 测试方法论和实验平台；理解推荐系统、搜索算法、用户画像等 AI/ML 产品原理；具备良好的商业思维，能进行市场分析和 ROI 测算；熟练使用 Jira、Confluence、飞书进行项目管理和团队协作；具备产品团队管理经验，曾带领 5 人产品团队。' },
      selfEvaluation: { content: '7 年产品经验，横跨出行、电商、本地生活三大行业，始终在业务一线直面用户需求。具备从零到一的产品搭建能力，在美团主导的会员体系 2.0 项目中完成了千万级用户的增长和商业化闭环。擅长用数据驱动决策，习惯通过 A/B 测试和深度数据分析验证假设。具备良好的商业思维，能从市场格局、竞对动态、财务模型等多维度思考产品策略。有管理经验，带领 5 人团队在高效协作中持续交付价值。期望加入一个有愿景、有执行力的团队，做出对一个行业有深远影响的产品。' },
    },
  },

  // ═══ 5. 应届毕业生 ═══
  {
    name: '应届毕业生模板',
    category: '应届生',
    previewImage: '',
    resume: {
      title: '应届毕业生简历',
      type: 'freshgraduate',
      cover: '',
      basicInfo: { name: '孙七', gender: '女', phone: '138****8005', age: '22', email: 'sunqi@example.com', politicalStatus: '团员', workYear: '应届' },
      jobIntention: { jobIntention: 'Java 后端开发工程师（校招）', intentionCity: '广州', expectationSalary: '12-18K', entryTime: '随时到岗' },
      educationBackground: [
        { schoolName: '中山大学', degree: '本科', major: '软件工程', enrollmentTime: '2020-09', graduationTime: '2024-06', content: 'GPA 3.7/4.0，专业排名前 15%。连续三年获校级优秀学生奖学金。ACM-ICPC 校赛一等奖（2022）、二等奖（2021）。获全国大学生数学建模竞赛广东省一等奖。发表 EI 检索论文 1 篇（第二作者，方向：图神经网络在图分类中的应用）。核心课程：数据结构（92）、算法设计与分析（90）、操作系统（88）、计算机网络（91）、数据库系统（93）、软件工程（90）。' },
      ],
      workExperience: [],
      internshipExperience: [
        { startTime: '2023-07', endTime: '2023-12', companyName: '腾讯（微信支付线）', position: '后端开发实习生', description: '参与微信支付商户结算系统的开发，使用 Go + tRPC 技术栈。独立开发了商户结算单查询接口，包括分页、筛选、导出 Excel 等功能，日均调用量 10 万+，接口 RT < 50ms。优化了结算任务的批量处理逻辑，使用协程池并发处理，日结算任务耗时从 4 小时降至 1.5 小时。编写了完善的单元测试和集成测试，代码覆盖率达到 85%+。参与 Code Review，学习了大厂代码规范和工程最佳实践。获得实习导师"优秀"评价，并收到转正 Offer 邀约。' },
        { startTime: '2023-01', endTime: '2023-04', companyName: '字节跳动（飞书文档）', position: '后端开发实习生（远程）', description: '参与飞书文档协作文档服务的开发，使用 Go + Kitex 微服务框架。实现了文档评论系统的消息通知功能，通过消息队列异步推送，支持 WebSocket 实时推送和邮件通知两种渠道。优化了文档版本的存储方案，通过增量存储将存储空间节省 40%。修复了 3 个线上 Bug，完成了 2 个小需求的开发。学习了微服务架构、CI/CD 流水线和飞书内部开发工具链的使用。' },
      ],
      campusExperience: [
        { startTime: '2022-09', endTime: '2023-06', title: '中山大学 ACM 集训队副队长', description: '负责组织每周算法训练，辅导低年级队员', content: '组织每周 2 次算法集训，涵盖动态规划、图论、计算几何、字符串等专题。独立出题 20+ 道，搭建了校内 OJ 训练平台。带队参加 2022 年 ACM-ICPC 亚洲区域赛（南京站），获得银牌。培养了 5 名新队员进入省赛获奖名单。' },
        { startTime: '2021-06', endTime: '2022-06', title: '计算机学院学生会技术部部长', description: '负责学院技术活动的策划与组织', content: '策划并组织了第一届"中山大学黑客马拉松"，吸引全校 150+ 名同学参赛。邀请了腾讯、字节跳动的技术专家担任评委。活动获评校级优秀学生活动。建立了学院技术分享平台，组织了 12 场技术讲座。' },
      ],
      projectExperience: [
        { startTime: '2023-03', endTime: '2023-06', title: '校园二手交易小程序 — 后端', description: '独立开发的校园二手交易平台后端服务', content: '使用 Go + Gin 框架 + MySQL + Redis 技术栈。实现了用户注册登录（JWT）、商品发布与管理、搜索与筛选、聊天消息（WebSocket）、订单管理等功能模块。设计了基于 Redis + Lua 脚本的分布式限流方案，防止恶意刷单。使用 Docker Compose 实现了开发环境的一键部署。部署到腾讯云轻量服务器，上线 3 个月注册用户 2000+，累计交易订单 1500+。获得 2023 年中山大学软件工程课程设计优秀项目。GitHub 仓库获得 350+ Star。' },
        { startTime: '2022-10', endTime: '2023-01', title: '在线判题系统（Online Judge）微服务版', description: '基于微服务架构重构的在线判题系统', content: '使用 Java Spring Cloud + RabbitMQ + Docker 技术栈。将原单体 OJ 系统拆分为用户服务、题目服务、判题服务、竞赛服务 4 个微服务。设计了基于消息队列的异步判题流程，支持并发判题，最大并发数 200。使用 Docker 沙箱隔离判题环境，防止恶意代码影响宿主机。实现了比赛实时排行榜，通过 Redis Sorted Set 实现 O(log N) 的排名更新。获得 2022 年广东省大学生计算机设计大赛三等奖。' },
      ],
      skills: { content: '熟练掌握 Java、Go 语言，熟悉 Python；熟悉 Spring Boot、Gin 等 Web 框架；熟悉 MySQL 数据库设计与 SQL 优化，了解索引原理；熟悉 Redis 缓存策略和常用数据结构；了解 RabbitMQ/Kafka 消息队列基本使用；熟练使用 Git 版本控制和 GitHub 协作；了解 Docker 容器化部署；了解 Linux 基本操作和 Shell 脚本；通过 CET-6（580 分），能流畅阅读英文技术文档；有良好的算法基础和 ACM 竞赛经验；了解 CI/CD 和 DevOps 理念。' },
      selfEvaluation: { content: '2024 届软件工程专业应届毕业生，具备扎实的计算机科学基础和较强的编程能力。对后端开发有浓厚兴趣，在课堂之外通过自学和项目实践深入学习了分布式系统、微服务架构等企业级技术。在腾讯和字节跳动的两段实习经历中，不仅提升了工程能力，更重要的是学习了大厂的开发流程、代码规范和团队协作方式。ACM 竞赛背景让我具备了良好的算法思维和问题拆解能力，能够快速定位和解决复杂问题。性格开朗、乐于沟通，善于在团队中学习和分享。期望加入一个有技术深度、重视新人培养的团队，从一线开发做起，踏实成长为核心骨干。' },
    },
  },
];

/* ================================================================== */
/*  主函数                                                             */
/* ================================================================== */

async function seed() {
  console.log('🚀 开始远程服务器种子数据初始化（丰富版）...');
  console.log(`📦 连接数据库: ${MONGODB_URI}`);

  await mongoose.connect(MONGODB_URI);
  console.log('✅ 数据库连接成功');

  const UserModel = mongoose.model('User', UserSchema);
  const ResumeModel = mongoose.model('Resume', ResumeSchema);
  const TemplateModel = mongoose.model('Template', TemplateSchema);

  // ── 1. 创建 admin 用户 ──
  let adminUser = await UserModel.findOne({ username: ADMIN_USER.username });
  if (adminUser) {
    console.log(`👤 Admin 用户已存在: ${adminUser.email} (${adminUser._id})`);
  } else {
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
    adminUser = await UserModel.create({
      username: ADMIN_USER.username,
      email: ADMIN_USER.email,
      password: hashedPassword,
      createdVia: 'email',
      loginAttempts: 0,
      oauthProviders: [],
    });
    console.log(`👤 Admin 用户已创建: ${ADMIN_USER.username} / ${ADMIN_USER.email}`);
  }

  // ── 2. 清空旧模板 ──
  const oldTemplates = await TemplateModel.countDocuments();
  const oldResumes = await ResumeModel.countDocuments({ isTemplate: true });
  if (oldTemplates > 0 || oldResumes > 0) {
    console.log(`🗑️  清理旧数据: ${oldTemplates} 个模板, ${oldResumes} 个模板简历`);
    await TemplateModel.deleteMany({});
    await ResumeModel.deleteMany({ isTemplate: true });
  }

  // ── 3. 创建模板 ──
  console.log(`\n📝 开始创建 ${templates.length} 个丰富简历模板...\n`);
  for (let i = 0; i < templates.length; i++) {
    const tpl = templates[i];

    const resumeDoc = await ResumeModel.create({
      userId: adminUser._id.toString(),
      user: adminUser._id,
      title: tpl.resume.title,
      type: tpl.resume.type,
      cover: tpl.resume.cover,
      isTemplate: true,
      basicInfo: tpl.resume.basicInfo,
      jobIntention: tpl.resume.jobIntention,
      educationBackground: tpl.resume.educationBackground,
      workExperience: tpl.resume.workExperience || [],
      projectExperience: tpl.resume.projectExperience || [],
      campusExperience: tpl.resume.campusExperience || [],
      internshipExperience: tpl.resume.internshipExperience || [],
      skills: tpl.resume.skills,
      certificates: { content: '' },
      selfEvaluation: tpl.resume.selfEvaluation,
    });

    await TemplateModel.create({
      name: tpl.name,
      category: tpl.category,
      previewImage: tpl.previewImage,
      usedCount: 0,
      resume: resumeDoc._id,
      resumeId: resumeDoc._id.toString(),
      userId: adminUser._id.toString(),
    });

    console.log(`✅ [${i + 1}/${templates.length}] ${tpl.name}`);
  }

  console.log(`\n🎉 完成！共 ${templates.length} 个模板`);
  await mongoose.disconnect();
}

seed().catch((err) => { console.error('❌ 失败:', err); process.exit(1); });
