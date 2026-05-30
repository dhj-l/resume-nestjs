const admin = db.users.findOne({username:'admin'});
if(!admin){ print('admin not found'); quit(); }
const uid = admin._id.toString();

// 清旧
db.resumes.deleteMany({userId:uid});

// ── 简历数据（基于本地真实简历，已替换隐私信息）──

const list = [
  // ═══ 1. 前端开发工程师 ═══
  {
    title:'前端开发工程师简历',
    type:'frontend',
    cover:'',
    isTemplate:false,
    globalStyle:{},
    certificates:{content:''},
    basicInfo:{name:'陈思远',gender:'男',phone:'139****1023',age:'24',email:'chensy@example.com',avatar:'/uploads/placeholder.png',politicalStatus:'团员',workYear:'2年'},
    jobIntention:{jobIntention:'前端开发工程师',intentionCity:'深圳',expectationSalary:'18-30K',entryTime:'两周内到岗'},
    educationBackground:[
      {schoolName:'华南理工大学',degree:'本科',major:'软件工程',enrollmentTime:'2019-09',graduationTime:'2023-06',
       content:'<ul><li>专业课程涵盖数据结构、算法、计算机网络、操作系统等核心领域，GPA 3.6/4.0。</li><li>在校期间积极参与开源社区，为 ElementPlus 贡献代码，锻炼了工程化协作能力。</li></ul>',globalSort:3,localSort:1}
    ],
    workExperience:[
      {companyName:'深圳创享科技',position:'前端开发工程师',workTime:'2023-07',dismissalTime:'至今',
       workDescription:'<ul><li>负责公司 SaaS 产品前端架构设计与核心模块开发，使用 <strong>React 18 + TypeScript + Zustand</strong> 技术栈。</li><li>主导了组件库从零到一的建设，开发 40+ 业务组件，覆盖表单、数据展示、反馈等场景。</li><li>通过代码分割、虚拟列表、图片懒加载等手段，将首屏加载时间从 3.8s 优化至 1.5s。</li><li>引入 E2E 测试（Playwright），编写 150+ 用例，线上 Bug 率下降 60%。</li><li>推动前端工程化建设，统一 ESLint/Prettier 规范，建立 CI/CD 流水线。</li></ul>',globalSort:1,localSort:1}
    ],
    projectExperience:[
      {startTime:'2024-03',endTime:'2024-08',title:'跨平台组件库建设',description:'为多产品线提供统一 UI 规范的组件库',
       content:'<ul><li>独立完成组件库技术选型和架构设计，基于 <strong>React + Rollup + Storybook</strong> 技术栈。</li><li>开发了 Table（支持排序/筛选/分页/虚拟滚动）、Form（声明式校验）、Chart 等 30+ 核心组件。</li><li>实现按需加载和 Tree Shaking，组件库打包体积仅 120KB（gzip）。</li><li>编写完善文档和示例，组件库在部门 4 个产品线推广使用，开发效率提升 35%。</li></ul>',globalSort:2,localSort:1},
      {startTime:'2023-10',endTime:'2024-01',title:'前端性能监控平台',description:'搭建前端异常监控与性能分析系统',
       content:'<ul><li>基于 Sentry 自建前端异常监控，接入 8 个前端项目，实现 SourceMap 自动上传。</li><li>搭建性能监控看板，实时追踪 FCP、LCP、TTI、CLS 等 Web Vitals 指标。</li><li>配置钉钉/飞书告警通知，关键异常 5 分钟内响应，MTTR 从 45 分钟降至 8 分钟。</li></ul>',globalSort:2,localSort:2}
    ],
    campusExperience:[
      {startTime:'2022-03',endTime:'2023-06',title:'ElementPlus 开源贡献者',description:'参与大型 Vue3 组件库开发',
       content:'<ul><li>为 ElementPlus 提交 15+ PR，包含组件功能实现与 Bug 修复。</li><li>独立完成了 Tree 组件的拖拽排序功能，被合并至主分支。</li><li>通过参与开源，深入理解 Vue3 生态和大型项目协作流程。</li></ul>',globalSort:5,localSort:1}
    ],
    skills:{content:'<ul><li>精通 <strong>React、Vue3、TypeScript</strong>，熟悉 Next.js、Nuxt.js 等 SSR 框架</li><li>深入理解 <strong>Webpack、Vite、Rollup</strong> 等构建工具原理与优化策略</li><li>熟练使用 <strong>Zustand、Pinia、Redux</strong> 等状态管理方案</li><li>熟悉 <strong>Node.js、NestJS</strong> 后端开发，具备 BFF 层开发经验</li><li>掌握 <strong>Playwright、Cypress</strong> 自动化测试框架</li><li>了解 Docker、CI/CD、Nginx 等 DevOps 工具链</li><li>具备良好的性能优化意识和前端安全知识</li></ul>',globalSort:6},
    selfEvaluation:{content:'<ul><li>2 年前端开发经验，具备扎实的计算机基础和良好的工程化思维。</li><li>主导过组件库从零建设，积累了前端基础设施建设的实践经验。</li><li>热爱技术，持续关注前端发展趋势，有开源贡献经历。</li><li>擅长性能优化和用户体验改进，习惯用数据驱动决策。</li><li>具备良好的沟通协作能力，能与产品和后端高效配合。</li></ul>',globalSort:8}
  },

  // ═══ 2. 全栈开发工程师 ═══
  {
    title:'全栈开发工程师简历',
    type:'default',
    cover:'',
    isTemplate:false,
    globalStyle:{},
    certificates:{content:''},
    basicInfo:{name:'林雨晨',gender:'男',phone:'185****3056',age:'26',email:'linyc@example.com',avatar:'/uploads/placeholder.png',politicalStatus:'党员',workYear:'4年'},
    jobIntention:{jobIntention:'全栈开发工程师',intentionCity:'杭州',expectationSalary:'28-45K',entryTime:'一个月内到岗'},
    educationBackground:[
      {schoolName:'华中科技大学',degree:'本科',major:'计算机科学与技术',enrollmentTime:'2016-09',graduationTime:'2020-06',
       content:'<ul><li>GPA 3.7/4.0，获校级奖学金 2 次。ACM-ICPC 校赛二等奖。</li><li>毕业设计《基于微服务架构的在线考试系统》获优秀毕业论文。</li></ul>',globalSort:3,localSort:1}
    ],
    workExperience:[
      {companyName:'杭州云柚科技',position:'全栈开发工程师',workTime:'2022-04',dismissalTime:'至今',
       workDescription:'<ul><li>负责公司核心 B2B 平台的全栈开发，前端使用 <strong>React + Ant Design</strong>，后端使用 <strong>NestJS + PostgreSQL + Redis</strong>。</li><li>设计并实现了基于 <strong>RBAC</strong> 的权限管理系统，支持多租户隔离和细粒度权限控制。</li><li>主导了消息推送系统的架构设计，使用 <strong>WebSocket + RabbitMQ</strong> 实现实时通知，日均推送 50 万+。</li><li>优化数据库查询性能，通过索引优化和查询重构，复杂报表查询从 12s 降至 800ms。</li><li>搭建了基于 Docker Compose 的本地开发环境，新成员入职搭建时间从 2 天缩短至 30 分钟。</li></ul>',globalSort:1,localSort:1},
      {companyName:'上海码蜂信息',position:'前端开发工程师',workTime:'2020-07',dismissalTime:'2022-03',
       workDescription:'<ul><li>负责电商后台管理系统的前端开发，使用 <strong>Vue 2 + Element UI</strong>。</li><li>独立完成商品管理、订单管理、数据报表 3 个核心模块，代码量 5 万+。</li><li>将项目从 JavaScript 迁移至 <strong>TypeScript</strong>，类型覆盖率 90%+，减少运行时错误 40%。</li><li>基于 ECharts 封装可复用的图表组件库，支持 10+ 种图表类型和动态配置。</li></ul>',globalSort:1,localSort:2}
    ],
    projectExperience:[
      {startTime:'2023-01',endTime:'2023-12',title:'B2B 交易平台重构',description:'将单体应用升级为微服务架构',
       content:'<ul><li>作为核心开发者参与架构升级，将单体 NestJS 应用拆分为用户、商品、订单、支付 4 个微服务。</li><li>使用 <strong>RabbitMQ</strong> 实现服务间异步通信，保证数据最终一致性。</li><li>引入 <strong>Redis</strong> 缓存热点数据，商品详情页 QPS 从 200 提升至 2000。</li><li>实现了基于 <strong>JWT + OAuth2.0</strong> 的统一认证中心，支持 SSO 单点登录。</li><li>编写了 200+ 单元测试和集成测试，代码覆盖率 80%+。</li></ul>',globalSort:2,localSort:1},
      {startTime:'2021-06',endTime:'2021-12',title:'内部 DevOps 工具链搭建',description:'搭建团队内部的 CI/CD 基础设施',
       content:'<ul><li>使用 <strong>GitLab CI + Docker + Kubernetes</strong> 搭建自动化部署流水线。</li><li>实现了代码提交 → 自动构建 → 单元测试 → 镜像打包 → 滚动更新的全流程自动化。</li><li>部署频率从每周 1 次提升到每天 5 次，回滚时间从 30 分钟降至 2 分钟。</li><li>搭建了基于 <strong>Prometheus + Grafana</strong> 的监控告警系统。</li></ul>',globalSort:2,localSort:2}
    ],
    skills:{content:'<ul><li><strong>前端</strong>：精通 React、Vue3、TypeScript，熟悉 Next.js、Ant Design、Tailwind CSS</li><li><strong>后端</strong>：精通 NestJS、Node.js，熟悉 PostgreSQL、MongoDB、Redis</li><li><strong>DevOps</strong>：熟练使用 Docker、Kubernetes、GitLab CI、GitHub Actions</li><li>熟悉 <strong>RabbitMQ、Kafka</strong> 消息队列，了解事件驱动架构</li><li>熟悉 <strong>微服务架构</strong>设计模式和分布式系统原理</li><li>具备良好的系统设计能力，能从全局视角权衡技术方案</li></ul>',globalSort:6},
    selfEvaluation:{content:'<ul><li>4 年全栈开发经验，兼具前端用户体验思维和后端系统设计能力。</li><li>主导过单体应用向微服务架构的升级，积累了分布式系统的实战经验。</li><li>热爱技术分享，在团队内做过 10+ 次技术分享，推动团队技术水平提升。</li><li>具备良好的产品思维，能从用户视角出发推动技术方案落地。</li><li>期望在技术驱动、有挑战性的团队中持续成长。</li></ul>',globalSort:8}
  },

  // ═══ 3. 后端开发工程师 ═══
  {
    title:'后端开发工程师简历',
    type:'backend',
    cover:'',
    isTemplate:false,
    globalStyle:{},
    certificates:{content:''},
    basicInfo:{name:'张浩然',gender:'男',phone:'177****8921',age:'27',email:'zhanghr@example.com',avatar:'/uploads/placeholder.png',politicalStatus:'群众',workYear:'5年'},
    jobIntention:{jobIntention:'高级后端开发工程师',intentionCity:'上海',expectationSalary:'35-55K',entryTime:'一个月内到岗'},
    educationBackground:[
      {schoolName:'浙江大学',degree:'硕士',major:'计算机科学与技术',enrollmentTime:'2017-09',graduationTime:'2020-06',
       content:'<ul><li>研究方向：分布式数据库与存储系统。发表 CCF-B 类论文 1 篇。</li><li>获国家奖学金。GPA 3.8/4.0。</li></ul>',globalSort:3,localSort:1},
      {schoolName:'武汉大学',degree:'本科',major:'软件工程',enrollmentTime:'2013-09',graduationTime:'2017-06',
       content:'<ul><li>GPA 3.6/4.0，获校级优秀毕业生。蓝桥杯全国总决赛二等奖。</li></ul>',globalSort:3,localSort:2}
    ],
    workExperience:[
      {companyName:'上海星环科技',position:'高级后端工程师',workTime:'2022-03',dismissalTime:'至今',
       workDescription:'<ul><li>负责分布式数据库 <strong>ArgoDB</strong> 核心模块开发，使用 <strong>Java + C++</strong> 技术栈。</li><li>主导了查询优化器的 CBO（基于代价的优化）模块，通过直方图统计和基数估计，复杂查询性能提升 40%。</li><li>实现了分布式事务的 <strong>2PC + Paxos</strong> 一致性协议，保证跨节点事务的 ACID 特性。</li><li>设计了基于 <strong>Raft</strong> 的元数据管理服务，支持集群自动故障转移，切换时间 < 10s。</li><li>TPC-H 基准测试中，带领优化小组将 22 条查询总耗时从 380s 降至 210s。</li></ul>',globalSort:1,localSort:1},
      {companyName:'北京百度网讯科技',position:'后端开发工程师',workTime:'2020-07',dismissalTime:'2022-02',
       workDescription:'<ul><li>参与百度云数据库 <strong>GaiaDB</strong> 的开发，负责 SQL 解析和查询执行引擎。</li><li>基于 <strong>LLVM JIT</strong> 实现了表达式计算加速，聚合查询性能提升 3 倍。</li><li>优化了 <strong>B+ 树索引</strong>的并发控制，使用 Lock-Coupling 算法，索引并发读写吞吐量提升 2.5 倍。</li><li>修复了 5 个线上 Critical Bug，获得部门 Bug 终结者称号。</li></ul>',globalSort:1,localSort:2}
    ],
    projectExperience:[
      {startTime:'2023-06',endTime:'2024-06',title:'ArgoDB CBO 查询优化器',description:'实现基于代价的查询优化器',
       content:'<ul><li>独立完成 CBO 优化器的技术方案设计和核心代码实现。</li><li>实现了表统计信息收集（直方图、NDV、NULL 比例等）和基数估算框架。</li><li>设计了基于动态规划的多表 Join 顺序枚举算法。</li><li>TPC-H 22 条查询平均性能提升 45%，部分查询（Q5、Q9）提升超过 10 倍。</li></ul>',globalSort:2,localSort:1},
      {startTime:'2021-03',endTime:'2021-12',title:'GaiaDB 并行查询引擎',description:'为云数据库增加并行查询能力',
       content:'<ul><li>设计并实现了基于 Volcano 模型的并行查询执行框架。</li><li>支持并行扫描、并行聚合、并行 Hash Join 三种算子。</li><li>通过自适应并行度决策，根据数据量和 CPU 核心数动态调整并行度。</li><li>TPC-H 测试中，并行查询相比串行平均加速 3.2 倍。</li></ul>',globalSort:2,localSort:2}
    ],
    skills:{content:'<ul><li>精通 <strong>Java、C++</strong>，深入理解 JVM 内存模型和 GC 机制</li><li>精通 <strong>MySQL、PostgreSQL</strong> 内核原理，熟悉查询优化器和存储引擎</li><li>熟悉 <strong>分布式一致性协议</strong>（Paxos、Raft、2PC、3PC）</li><li>熟悉 <strong>Redis、RocksDB</strong> 等存储引擎的内部实现</li><li>熟悉 <strong>Linux 系统编程</strong>，理解内存管理、文件系统和网络协议栈</li><li>具备大型分布式系统的性能调优和 Troubleshooting 经验</li></ul>',globalSort:6},
    selfEvaluation:{content:'<ul><li>5 年后端开发经验，专注于数据库内核和分布式存储领域。</li><li>深入理解查询优化、事务处理、索引结构等数据库核心技术。</li><li>具备从零设计复杂系统的能力，擅长性能分析和瓶颈定位。</li><li>有良好的学术素养，能将前沿研究成果转化为工程实践。</li><li>期望在数据库和基础设施领域持续深耕，成为技术专家。</li></ul>',globalSort:8}
  },

  // ═══ 4. AI应用开发工程师 ═══
  {
    title:'AI应用开发工程师简历',
    type:'default',
    cover:'',
    isTemplate:false,
    globalStyle:{},
    certificates:{content:''},
    basicInfo:{name:'赵晓峰',gender:'男',phone:'132****6678',age:'25',email:'zhaoxf@example.com',avatar:'/uploads/placeholder.png',politicalStatus:'团员',workYear:'2年'},
    jobIntention:{jobIntention:'AI应用开发工程师',intentionCity:'北京',expectationSalary:'22-35K',entryTime:'两周内到岗'},
    educationBackground:[
      {schoolName:'北京邮电大学',degree:'本科',major:'人工智能',enrollmentTime:'2019-09',graduationTime:'2023-06',
       content:'<ul><li>GPA 3.5/4.0。主修机器学习、深度学习、自然语言处理、计算机视觉等课程。</li><li>毕业设计《基于大语言模型的智能客服系统》获院级优秀论文。</li></ul>',globalSort:3,localSort:1}
    ],
    workExperience:[
      {companyName:'北京智源科技',position:'AI应用开发工程师',workTime:'2023-07',dismissalTime:'至今',
       workDescription:'<ul><li>负责公司 <strong>AI智能客服平台</strong>的前端与 BFF 层开发，前端基于 <strong>NuxtJS</strong>，BFF 层基于 <strong>NestJS</strong>。</li><li>集成 <strong>LangChain + DeepSeek</strong> 大模型，实现了上下文感知的多轮对话引擎，支持企业定制化知识库。</li><li>设计了 <strong>提示词工程（Prompt Engineering）</strong>体系，包括 System Prompt、Few-shot 示例和动态上下文注入，意图识别准确率从 72% 提升至 91%。</li><li>实现了基于 <strong>RAG（检索增强生成）</strong>的知识库问答，使用向量数据库（ChromaDB）存储文档嵌入，回答准确率提升 35%。</li><li>搭建了 AI 效果评估体系，追踪解决率、满意度、Token 消耗等指标，支持 A/B 测试不同模型和 Prompt 策略。</li><li>构建了敏感内容识别和自动升舱机制，高风险对话自动转人工，客户满意度从 78% 提升至 92%。</li></ul>',globalSort:1,localSort:1}
    ],
    projectExperience:[
      {startTime:'2024-03',endTime:'2024-10',title:'企业级 RAG 知识库问答系统',description:'基于检索增强生成的企业知识库问答',
       content:'<ul><li>使用 <strong>LangChain + ChromaDB + DeepSeek</strong> 技术栈，实现企业文档的智能问答。</li><li>设计了文档分块策略（基于语义的 Recursive Split），兼顾上下文完整性和检索精度。</li><li>实现了混合检索（向量检索 + 关键词检索），Top-5 召回率从 68% 提升至 89%。</li><li>使用 <strong>NestJS</strong> 构建 BFF 层，封装 LLM 调用、Token 管理和缓存逻辑。</li><li>支持多租户隔离，每个企业的知识库完全独立。</li></ul>',globalSort:2,localSort:1},
      {startTime:'2023-09',endTime:'2024-02',title:'AIAgent 工作流引擎',description:'基于大模型的自动化任务编排系统',
       content:'<ul><li>参与技术方案讨论，提出"原子操作 + 整体回滚 + 提示词工程"方案并被采纳。</li><li>实现了基于 <strong>LangGraph</strong> 的 Agent 工作流编排，支持顺序、条件分支、循环等控制流。</li><li>设计了工具调用（Function Calling）框架，Agent 可调用搜索、计算、数据库查询等外部工具。</li><li>实现了对话占位符 + 流式输出（SSE）的前后端联动方案，用户体验流畅自然。</li></ul>',globalSort:2,localSort:2}
    ],
    campusExperience:[
      {startTime:'2022-06',endTime:'2023-05',title:'AI 技术社区组织者',description:'组织校园 AI 学习小组和 Hackathon',
       content:'<ul><li>组织了 30+ 人的 AI 学习小组，每周分享论文和技术实践。</li><li>策划了首届校园 AI Hackathon，吸引 15 支队伍参赛。</li></ul>',globalSort:5,localSort:1}
    ],
    skills:{content:'<ul><li>精通 <strong>React、Vue3、TypeScript、NuxtJS、NestJS</strong>，具备全栈 AI 应用开发能力</li><li>熟悉 <strong>LangChain、LangGraph、LlamaIndex</strong> 等 LLM 应用开发框架</li><li>熟悉 <strong>RAG 架构</strong>设计，包括文档处理、向量数据库、检索策略等</li><li>熟悉 <strong>Prompt Engineering</strong> 方法论，能系统性优化模型输出质量</li><li>了解 <strong>DeepSeek、GPT、Claude</strong> 等主流大模型的能力边界和调用方式</li><li>熟悉 <strong>SSE/WebSocket</strong> 实时通信方案，有流式输出落地经验</li><li>了解 <strong>Python + PyTorch</strong> 基础，能阅读和理解模型代码</li></ul>',globalSort:6},
    selfEvaluation:{content:'<ul><li>2 年 AI 应用开发经验，专注于将大模型能力落地为企业级产品。</li><li>主导过 RAG 知识库和 AI Agent 两个核心项目的技术方案设计与实现。</li><li>对大模型的能力边界和局限性有实战认知，擅长通过工程手段弥补模型短板。</li><li>具备从 Prompt 设计到后端架构到前端交互的全链路开发能力。</li><li>对 AI 技术驱动的产品创新充满热情，期望在 AI 应用领域持续深耕。</li></ul>',globalSort:8}
  },

  // ═══ 5. 应届毕业生 ═══
  {
    title:'应届毕业生简历',
    type:'freshgraduate',
    cover:'',
    isTemplate:false,
    globalStyle:{},
    certificates:{content:''},
    basicInfo:{name:'王雨桐',gender:'女',phone:'156****4532',age:'22',email:'wangyt@example.com',avatar:'/uploads/placeholder.png',politicalStatus:'团员',workYear:'应届'},
    jobIntention:{jobIntention:'前端开发工程师（校招）',intentionCity:'深圳',expectationSalary:'12-18K',entryTime:'随时到岗'},
    educationBackground:[
      {schoolName:'南京邮电大学',degree:'本科',major:'网络工程',enrollmentTime:'2021-09',graduationTime:'2025-06',
       content:'<ul><li>GPA 3.5/4.0，获校级奖学金 2 次。ACM 校赛三等奖。</li><li>通过 CET-6（560 分），能流畅阅读英文技术文档。</li><li>核心课程：数据结构（89）、操作系统（85）、计算机网络（91）、数据库（88）。</li></ul>',globalSort:3,localSort:1}
    ],
    workExperience:[],
    internshipExperience:[
      {startTime:'2024-07',endTime:'2024-12',companyName:'深圳字节跳动',position:'前端开发实习生',
       description:'<ul><li>参与飞书文档协作编辑模块的前端开发，使用 <strong>React + TypeScript</strong> 技术栈。</li><li>实现了协同光标展示功能，通过 <strong>WebSocket</strong> 实时同步多用户编辑位置。</li><li>优化了长文档的渲染性能，使用虚拟滚动将 10 万字文档的渲染时间从 3s 降至 300ms。</li><li>编写了 50+ 单元测试用例，参与 Code Review，学习了大厂代码规范。</li><li>获得 Mentor"优秀"评价和转正邀请。</li></ul>',globalSort:4,localSort:1},
      {startTime:'2024-01',endTime:'2024-04',companyName:'南京小米科技',position:'前端开发实习生（远程）',
       description:'<ul><li>参与小米商城 H5 活动页的开发，使用 <strong>Vue3 + Vite</strong> 技术栈。</li><li>独立完成了 3 个营销活动页面的开发，包括秒杀、抽奖、拼团等互动功能。</li><li>使用 <strong>CSS Animation + GSAP</strong> 实现了流畅的页面动效，活动页转化率提升 12%。</li><li>学习了 Git Flow 工作流和 Jira 项目管理工具的使用。</li></ul>',globalSort:4,localSort:2}
    ],
    projectExperience:[
      {startTime:'2024-03',endTime:'2024-06',title:'校园二手交易平台',description:'全栈开发的校园二手交易小程序',
       content:'<ul><li>独立完成前后端开发，前端使用 <strong>Vue3 + UniApp</strong>，后端使用 <strong>NestJS + MongoDB</strong>。</li><li>实现了商品发布与搜索、即时聊天（WebSocket）、订单管理、用户评价等功能。</li><li>使用 JWT 实现用户认证，Redis 缓存热门商品列表。</li><li>部署到腾讯云服务器，校内推广后注册用户 1500+，累计交易 800+ 单。</li></ul>',globalSort:2,localSort:1},
      {startTime:'2023-09',endTime:'2023-12',title:'LeetCode 刷题笔记网站',description:'基于 VitePress 的个人算法学习网站',
       content:'<ul><li>整理 LeetCode 200+ 题的解题思路和代码实现，按专题分类（动态规划、二叉树、图论等）。</li><li>每道题包含题目分析、多种解法对比、时空复杂度分析和易错点总结。</li><li>网站月均 PV 3000+，GitHub 仓库获得 400+ Star，帮助了许多校招同学。</li></ul>',globalSort:2,localSort:2}
    ],
    campusExperience:[
      {startTime:'2023-09',endTime:'2024-06',title:'计算机协会技术部部长',description:'组织技术分享和编程竞赛',
       content:'<ul><li>组织了 15 场技术分享会，涵盖前端、后端、算法等方向。</li><li>策划了第二届校园编程马拉松，吸引 100+ 同学参赛。</li><li>建立了协会专属 OJ 平台，供成员日常训练使用。</li></ul>',globalSort:5,localSort:1}
    ],
    skills:{content:'<ul><li>熟练掌握 <strong>Vue3、React、TypeScript、JavaScript</strong></li><li>熟悉 <strong>Node.js、NestJS</strong> 后端开发，了解 RESTful API 设计</li><li>熟悉 <strong>MySQL、MongoDB、Redis</strong> 数据库基本使用</li><li>熟练使用 <strong>Git、Vite、Webpack</strong> 等工程化工具</li><li>了解 <strong>Docker、Linux</strong> 基本操作</li><li>LeetCode 200+，有良好的算法基础和问题解决能力</li><li>通过 CET-6，英文技术文档阅读无障碍</li></ul>',globalSort:6},
    selfEvaluation:{content:'<ul><li>2025 届应届毕业生，具备扎实的前端基础和全栈项目经验。</li><li>两段大厂实习经历（字节跳动、小米），熟悉企业级开发流程和规范。</li><li>独立完成过全栈项目，具备从需求分析到上线部署的完整能力。</li><li>热爱技术分享，通过刷题笔记网站帮助了许多同学，也锻炼了自己的表达能力。</li><li>性格开朗、乐于沟通，实习期间获得 Mentor 和同事的一致好评。</li><li>期望加入一个技术氛围浓厚、重视新人培养的团队，快速成长。</li></ul>',globalSort:8}
  }
];

// ── 执行 ──
list.forEach(function(r){
  r.userId = uid;
  r.user = admin._id;
  db.resumes.insertOne(r);
});
print('done: ' + list.length + ' resumes');
