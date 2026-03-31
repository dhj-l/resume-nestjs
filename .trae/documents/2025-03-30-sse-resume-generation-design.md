# SSE简历生成实现方案

## 1. 项目背景

当前项目使用大型prompt生成简历，已优化为模块化结构（11个独立模块）。需要实现SSE（Server-Sent Events）功能，在简历生成过程中实时推送进度更新。

## 2. 需求分析

### 2.1 核心需求
- 按顺序执行所有模块prompt（位于`src/resume-ai/prompt/modules/`目录）
- 每个模块完成后通过SSE推送进度更新
- 推送格式：仅包含模块名称和完成状态
- 实现自动重试机制（重试3次后终止）
- 所有模块完成后聚合结果生成最终简历文档
- 确保SSE连接稳定性

### 2.2 技术约束
- 使用NestJS框架
- 当前使用@nestjs/common和rxjs
- 需要实现SSE连接管理
- 需要处理AI调用错误和重试逻辑

## 3. 架构设计

### 3.1 整体架构

```
Client → SSE Connection → Controller → Service → AI Model
                                    ↓
                              Module Processing
                                    ↓
                              SSE Progress Updates
```

### 3.2 模块执行流程

```
1. 验证输入（JD、简历内容）
2. 创建数据库记录（状态：Creating）
3. 按顺序执行11个模块：
   - basicInfo
   - jobIntention
   - globalStyle
   - skills
   - certificates
   - selfEvaluation
   - educationBackground
   - workExperience
   - projectExperience
   - campusExperience
   - internshipExperience
4. 每个模块执行后推送SSE进度
5. 聚合所有模块结果
6. 生成最终简历文档
7. 更新数据库记录状态（Completed/Failed）
8. 关闭SSE连接
```

### 3.3 数据结构设计

#### SSE消息格式
```typescript
interface SseMessage {
  type: 'progress' | 'error' | 'complete';
  moduleName: string;
  status: 'processing' | 'completed' | 'failed' | 'retrying';
  message?: string;
  retryCount?: number;
  totalModules: number;
  currentModule: number;
}
```

#### 模块执行配置
```typescript
interface ModuleConfig {
  name: string;
  prompt: string;
  dependencies: string[];
  priority: number;
}
```

#### 模块执行结果
```typescript
interface ModuleResult {
  moduleName: string;
  data: any;
  success: boolean;
  retryCount: number;
  error?: string;
}
```

## 4. 详细设计

### 4.1 Controller层设计

#### 端点设计
- 路径：`POST /resume-ai/generatesse`
- 返回：Observable<SseMessage>（SSE流）

#### 实现要点
- 使用`@Sse()`装饰器或手动实现SSE响应
- 设置适当的SSE响应头
- 处理客户端断开连接

### 4.2 Service层设计

#### 核心方法
```typescript
async generateResumeSse(
  createAiResuemDto: CreateAiResuemDto,
  userId: string
): Observable<SseMessage>
```

#### 模块执行器
```typescript
async executeModuleWithRetry(
  moduleName: string,
  prompt: string,
  jd: string,
  content: string,
  maxRetries: number
): Promise<ModuleResult>
```

#### 进度推送器
```typescript
private sendProgress(
  subject: Subject<SseMessage>,
  moduleName: string,
  status: string,
  current: number,
  total: number,
  message?: string
): void
```

### 4.3 错误处理机制

#### 重试策略
- 每个模块失败后自动重试3次
- 重试间隔：1秒（可配置）
- 重试状态通过SSE推送
- 3次重试失败后终止整个流程

#### 错误类型
- AI调用失败
- JSON解析失败
- 网络超时
- 数据验证失败

### 4.4 连接稳定性保障

#### 心跳机制
- 每30秒发送一次心跳消息
- 防止连接超时

#### 超时处理
- 每个模块设置超时时间（如60秒）
- 超时后触发重试机制

#### 资源清理
- 连接断开时清理资源
- 取消正在进行的AI调用

## 5. 实现步骤

### 5.1 创建SSE相关类型定义
- 创建`src/resume-ai/types/sse.types.ts`
- 定义SseMessage、ModuleResult等接口

### 5.2 创建模块配置文件
- 更新`src/resume-ai/prompt/modules/index.ts`
- 添加MODULE_EXECUTION_ORDER常量
- 添加MODULE_PROMPTS配置对象

### 5.3 实现SSE Service方法
- 在`ResumeAiService`中实现`generateResumeSse`方法
- 创建模块执行器方法
- 创建进度推送方法
- 实现重试逻辑

### 5.4 更新Controller
- 修改`generateResumeSse`端点
- 返回Observable<SseMessage>
- 设置SSE响应头

### 5.5 实现错误处理
- 添加重试机制
- 添加超时处理
- 添加连接断开处理

### 5.6 测试验证
- 测试正常流程
- 测试重试机制
- 测试错误处理
- 测试连接稳定性

## 6. 技术选型

### 6.1 SSE实现方式
- **方案1**：使用NestJS的`@Sse()`装饰器
  - 优点：官方支持，简单易用
  - 缺点：灵活性较低

- **方案2**：手动实现SSE响应
  - 优点：完全控制，灵活度高
  - 缺点：需要更多代码

**推荐方案2**，因为需要更细粒度的控制和自定义错误处理。

### 6.2 Observable实现
- 使用RxJS的`Observable`和`Subject`
- 实现流式数据推送
- 便于处理异步操作

## 7. 性能优化

### 7.1 并行执行
- 对于无依赖的模块，可以考虑并行执行
- 使用`Promise.all`或RxJS的`forkJoin`

### 7.2 缓存机制
- 缓存已执行的模块结果
- 避免重复计算

### 7.3 资源管理
- 及时释放AI模型资源
- 避免内存泄漏

## 8. 安全考虑

### 8.1 认证授权
- 使用JWT认证
- 验证用户权限

### 8.2 输入验证
- 验证JD和简历内容
- 防止注入攻击

### 8.3 速率限制
- 限制单个用户的并发SSE连接数
- 防止资源耗尽

## 9. 监控和日志

### 9.1 日志记录
- 记录每个模块的执行时间
- 记录重试次数和错误信息
- 记录SSE连接状态

### 9.2 性能监控
- 监控整体生成时间
- 监控各模块执行时间
- 监控SSE连接稳定性

## 10. 风险评估

### 10.1 技术风险
- AI模型响应时间不稳定
- 网络连接不稳定
- SSE连接意外断开

### 10.2 缓解措施
- 实现自动重试机制
- 实现心跳机制
- 实现连接恢复机制

## 11. 后续优化

### 11.1 功能增强
- 支持暂停/恢复生成
- 支持取消生成
- 支持生成进度持久化

### 11.2 性能优化
- 实现模块并行执行
- 优化AI模型调用
- 实现结果缓存

### 11.3 用户体验
- 提供更详细的进度信息
- 支持进度百分比显示
- 提供错误详情和建议
