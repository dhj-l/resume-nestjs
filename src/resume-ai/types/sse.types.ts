/**
 * SSE消息类型定义
 * 用于简历生成过程中的实时进度推送
 */

/**
 * SSE消息接口
 * 定义了服务器向客户端推送的进度消息格式
 */
export interface SseMessage {
  /** 消息类型：进度、错误或完成 */
  type: 'progress' | 'error' | 'complete' | 'heartbeat' | 'init';
  /** 当前处理的模块名称 */
  moduleName: string;
  /** 模块处理状态 */
  status: 'processing' | 'completed' | 'failed' | 'retrying' | 'started';
  /** 可选的附加消息 */
  message?: string;
  /** 重试次数（仅在重试时有值） */
  retryCount?: number;
  /** 总模块数量 */
  totalModules: number;
  /** 当前模块索引（从1开始） */
  currentModule: number;
  /** 数据库记录ID（仅在初始化时返回） */
  recordId?: string;
}

/**
 * 模块配置接口
 * 定义了每个模块的配置信息
 */
export interface ModuleConfig {
  /** 模块名称 */
  name: string;
  /** 模块的prompt内容 */
  prompt: string;
  /** 依赖的模块列表 */
  dependencies: string[];
  /** 执行优先级 */
  priority: number;
}

/**
 * 模块执行结果接口
 * 定义了模块执行后的结果
 */
export interface ModuleResult {
  /** 模块名称 */
  moduleName: string;
  /** 模块生成的数据 */
  data: any;
  /** 是否执行成功 */
  success: boolean;
  /** 重试次数 */
  retryCount: number;
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * SSE连接状态接口
 * 用于跟踪SSE连接的状态
 */
export interface SseConnectionState {
  /** 连接是否活跃 */
  isActive: boolean;
  /** 连接开始时间 */
  startTime: Date;
  /** 最后一次心跳时间 */
  lastHeartbeat: Date;
  /** 当前处理的模块索引 */
  currentModuleIndex: number;
  /** 已完成的模块结果 */
  completedModules: Map<string, ModuleResult>;
  /** 是否发生错误 */
  hasError: boolean;
  /** 错误信息 */
  errorMessage?: string;
}

/**
 * 重试配置接口
 * 定义了重试机制的配置参数
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries: number;
  /** 重试间隔（毫秒） */
  retryDelay: number;
  /** 指数退避因子 */
  backoffFactor: number;
}

/**
 * 心跳配置接口
 * 定义了心跳机制的配置参数
 */
export interface HeartbeatConfig {
  /** 心跳间隔（毫秒） */
  interval: number;
  /** 心跳超时时间（毫秒） */
  timeout: number;
}

/**
 * 模块执行上下文接口
 * 包含执行模块所需的所有上下文信息
 */
export interface ModuleExecutionContext {
  /** 岗位描述 */
  jobDescription: string;
  /** 简历内容 */
  resumeContent: string;
  /** 当前日期 */
  currentDate: string;
  /** 用户ID */
  userId: string;
  /** 模块配置 */
  moduleConfig: ModuleConfig;
  /** 重试配置 */
  retryConfig: RetryConfig;
}

/**
 * SSE响应头接口
 * 定义了SSE响应所需的HTTP头
 */
export interface SseHeaders {
  'Content-Type': string;
  'Cache-Control': string;
  Connection: string;
  'X-Accel-Buffering': string;
}
