# SSE简历生成接口文档

## 接口概述

| 项目 | 说明 |
|------|------|
| **接口名称** | SSE简历生成 |
| **功能描述** | 使用Server-Sent Events(SSE)技术实时推送简历生成进度，按顺序执行11个模块（基本信息、求职意向、全局样式、技能、证书、自我评价、教育背景、工作经历、项目经历、校园经历、实习经历），每个模块完成后推送进度更新，最终生成完整简历 |
| **请求URL** | `/resume-ai/generatesse` |
| **HTTP方法** | POST |
| **认证方式** | JWT Bearer Token |
| **响应格式** | Server-Sent Events (text/event-stream) |

---

## 请求头要求

| 请求头 | 必填 | 说明 | 示例值 |
|--------|------|------|--------|
| `Authorization` | 是 | JWT认证令牌 | `Bearer eyJhbGciOiJIUzI1NiIs...` |
| `Content-Type` | 是 | 请求体格式 | `application/json` |
| `Accept` | 否 | 建议值 | `text/event-stream` |

---

## 请求参数

### 请求体参数 (CreateAiResuemDto)

| 参数名 | 数据类型 | 是否必填 | 说明 |
|--------|----------|----------|------|
| `parseType` | string | 是 | 解析类型，枚举值：`upload` / `select` / `manual` |
| `jobDescription` | string | 是 | 岗位JD描述，用于指导简历生成 |
| `templateType` | string | 是 | 简历模板类型标识 |
| `resumeContent` | string | 条件必填 | 简历内容文本，当`parseType=upload`时必填 |
| `detailInfo` | object | 条件必填 | 详细信息对象，当`parseType=manual`时必填 |
| `resumeId` | string | 条件必填 | 已存在简历ID，当`parseType=select`时必填 |

### parseType枚举值说明

| 枚举值 | 说明 | 必填附加参数 |
|--------|------|--------------|
| `upload` | 上传外部简历 | `resumeContent` |
| `select` | 选择已有简历 | `resumeId` |
| `manual` | 手动输入信息 | `detailInfo` |

### detailInfo对象结构（parseType=manual时使用）

| 字段名 | 数据类型 | 说明 |
|--------|----------|------|
| `name` | string | 姓名 |
| `age` | number | 年龄 |
| `education` | string | 学历 |
| `school` | string | 学校 |
| `major` | string | 专业 |
| `targetRole` | string | 目标岗位 |
| `yearsOfExperience` | string | 工作经验 |
| `supplementary` | string | 补充信息 |

---

## 请求体格式示例

### 示例1：手动输入方式 (manual)

```json
{
  "parseType": "manual",
  "jobDescription": "岗位职责：\n1. 负责前端架构设计和开发\n2. 使用React/Vue进行页面开发\n3. 优化前端性能\n\n任职要求：\n1. 3年以上前端开发经验\n2. 精通React、TypeScript\n3. 熟悉Node.js",
  "templateType": "modern",
  "detailInfo": {
    "name": "张三",
    "age": 28,
    "education": "本科",
    "school": "北京大学",
    "major": "计算机科学与技术",
    "targetRole": "高级前端工程师",
    "yearsOfExperience": "5年",
    "supplementary": "精通React、Vue、TypeScript，有大型项目开发经验"
  }
}
```

### 示例2：上传简历方式 (upload)

```json
{
  "parseType": "upload",
  "jobDescription": "Java开发工程师，要求熟悉Spring Boot、MySQL",
  "templateType": "classic",
  "resumeContent": "张三，男，30岁，本科，5年Java开发经验..."
}
```

### 示例3：选择已有简历方式 (select)

```json
{
  "parseType": "select",
  "jobDescription": "产品经理，要求有3年以上经验",
  "templateType": "creative",
  "resumeId": "507f1f77bcf86cd799439011"
}
```

---

## 响应数据结构

### SSE消息格式 (SseMessage)

| 字段名 | 数据类型 | 说明 |
|--------|----------|------|
| `type` | string | 消息类型：`init` / `progress` / `complete` / `error` / `heartbeat` |
| `moduleName` | string | 模块名称或系统标识 |
| `status` | string | 状态：`started` / `processing` / `completed` / `failed` / `retrying` |
| `message` | string | 附加说明信息 |
| `retryCount` | number | 重试次数（仅在重试时出现） |
| `totalModules` | number | 总模块数量（固定为11） |
| `currentModule` | number | 当前模块索引（0-11） |
| `recordId` | string | 数据库记录ID（仅在init消息中返回） |

### 消息类型说明

| 类型 | 触发时机 | 说明 |
|------|----------|------|
| `init` | 任务创建后 | 返回数据库记录ID，表示任务已开始 |
| `progress` | 每个模块处理时 | 返回模块处理进度 |
| `complete` | 所有模块完成后 | 表示简历生成完成 |
| `error` | 发生错误时 | 返回错误信息 |
| `heartbeat` | 每30秒 | 保持连接活跃 |

---

## 成功响应示例

### 1. 初始化消息（首个消息）

```
data: {"type":"init","moduleName":"system","status":"started","message":"简历生成任务已创建","totalModules":11,"currentModule":0,"recordId":"507f1f77bcf86cd799439011"}

```

### 2. 模块处理中消息

```
data: {"type":"progress","moduleName":"basicInfo","status":"processing","message":"正在处理basicInfo模块","totalModules":11,"currentModule":1}

```

### 3. 模块完成消息

```
data: {"type":"progress","moduleName":"basicInfo","status":"completed","message":"basicInfo模块处理完成","totalModules":11,"currentModule":1}

```

### 4. 重试消息（失败时）

```
data: {"type":"progress","moduleName":"skills","status":"retrying","message":"skills模块重试中 (1/3)","retryCount":1,"totalModules":11,"currentModule":0}

```

### 5. 完成消息（最后一个消息）

```
data: {"type":"complete","moduleName":"complete","status":"completed","message":"简历生成完成","totalModules":11,"currentModule":11}

```

### 6. 心跳消息（每30秒）

```
data: {"type":"heartbeat","moduleName":"system","status":"processing","message":"heartbeat","totalModules":0,"currentModule":0}

```

---

## 错误响应示例

### 错误消息格式

```
data: {"type":"error","moduleName":"system","status":"failed","message":"AI调用失败","totalModules":11,"currentModule":0}

```

### 常见错误码及说明

| HTTP状态码 | 错误消息 | 说明 | 处理建议 |
|------------|----------|------|----------|
| 400 | JD校验通过 | 请求参数验证失败 | 检查请求参数是否符合要求 |
| 400 | 不存在该简历 | 选择的简历ID不存在 | 确认resumeId是否正确 |
| 400 | AI调用失败 | AI服务调用失败 | 稍后重试或联系管理员 |
| 400 | 简历内容校验通过 | 简历内容不符合要求 | 提供更详细的简历内容 |
| 401 | Unauthorized | JWT认证失败 | 检查Authorization头是否有效 |

---

## 模块执行顺序

系统按以下顺序执行11个模块：

| 序号 | 模块名称 | 中文名称 | 说明 |
|------|----------|----------|------|
| 1 | `basicInfo` | 基础信息 | 姓名、联系方式等 |
| 2 | `jobIntention` | 求职意向 | 目标岗位、期望薪资等 |
| 3 | `globalStyle` | 全局样式 | 简历整体样式配置 |
| 4 | `skills` | 技能 | 专业技能列表 |
| 5 | `certificates` | 证书 | 获得的证书 |
| 6 | `selfEvaluation` | 自我评价 | 个人评价描述 |
| 7 | `educationBackground` | 教育背景 | 学历、学校信息 |
| 8 | `workExperience` | 工作经历 | 工作经验 |
| 9 | `projectExperience` | 项目经历 | 项目经验 |
| 10 | `campusExperience` | 校园经历 | 校园活动经历 |
| 11 | `internshipExperience` | 实习经历 | 实习经验 |

---

## 前端调用示例

### JavaScript/EventSource示例

```javascript
// 创建SSE连接
const eventSource = new EventSource('/resume-ai/generatesse', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token'),
    'Content-Type': 'application/json'
  }
});

// 发送POST请求（SSE不支持POST，需要使用fetch）
const response = await fetch('/resume-ai/generatesse', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    parseType: 'manual',
    jobDescription: '...',
    templateType: 'modern',
    detailInfo: { ... }
  })
});

// 读取SSE流
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.substring(6));
      handleSseMessage(data);
    }
  }
}

// 处理SSE消息
function handleSseMessage(message) {
  switch (message.type) {
    case 'init':
      console.log('任务已创建，记录ID:', message.recordId);
      // 保存recordId用于后续查询
      break;
    case 'progress':
      console.log(`模块 ${message.moduleName} ${message.status}`);
      // 更新进度条
      updateProgress(message.currentModule, message.totalModules);
      break;
    case 'complete':
      console.log('简历生成完成');
      // 跳转到简历详情页
      break;
    case 'error':
      console.error('生成失败:', message.message);
      // 显示错误提示
      break;
    case 'heartbeat':
      // 心跳消息，无需处理
      break;
  }
}
```

### 使用RxJS示例

```typescript
import { Observable } from 'rxjs';

interface SseMessage {
  type: 'init' | 'progress' | 'complete' | 'error' | 'heartbeat';
  moduleName: string;
  status: string;
  message?: string;
  retryCount?: number;
  totalModules: number;
  currentModule: number;
  recordId?: string;
}

// 创建SSE Observable
function createSseObservable(url: string, body: any, token: string): Observable<SseMessage> {
  return new Observable(observer => {
    fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }).then(async response => {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          observer.complete();
          break;
        }
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data: SseMessage = JSON.parse(line.substring(6));
            observer.next(data);
          }
        }
      }
    }).catch(error => {
      observer.error(error);
    });
  });
}

// 使用
const sse$ = createSseObservable('/resume-ai/generatesse', requestBody, token);

sse$.subscribe({
  next: (message) => {
    console.log('收到消息:', message);
  },
  error: (error) => {
    console.error('连接错误:', error);
  },
  complete: () => {
    console.log('连接完成');
  }
});
```

---

## 调用注意事项

### 1. 连接管理

- **连接保持**：SSE连接会保持直到简历生成完成或发生错误
- **心跳机制**：服务端每30秒发送一次心跳消息，防止连接超时
- **自动重连**：建议前端实现自动重连机制，处理网络波动

### 2. 错误处理

- **重试机制**：每个模块失败后会自动重试3次，重试间隔为1秒、2秒、4秒
- **失败终止**：如果3次重试都失败，整个流程会终止并返回错误
- **连接断开**：客户端断开连接后，服务端会自动清理资源

### 3. 数据保存

- **立即保存recordId**：收到init消息后，立即保存recordId，用于后续查询生成状态
- **进度展示**：根据currentModule和totalModules计算进度百分比

### 4. 性能考虑

- **预计耗时**：完整生成一份简历大约需要30-60秒（取决于AI响应速度）
- **并发限制**：建议限制单个用户的并发请求数，避免资源耗尽
- **超时设置**：建议前端设置120秒超时，超过后提示用户重试

### 5. 最佳实践

```typescript
// 推荐的前端实现模式
class ResumeGenerator {
  private recordId: string | null = null;
  private abortController: AbortController | null = null;

  async generateResume(requestData: CreateAiResuemDto) {
    this.abortController = new AbortController();
    
    try {
      const response = await fetch('/resume-ai/generatesse', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.getToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      await this.processSseStream(response);
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('用户取消生成');
      } else {
        console.error('生成失败:', error);
        throw error;
      }
    }
  }

  private async processSseStream(response: Response) {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const messages = this.parseSseMessages(decoder.decode(value));
        for (const message of messages) {
          this.handleMessage(message);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private parseSseMessages(chunk: string): SseMessage[] {
    return chunk
      .split('\n\n')
      .filter(line => line.startsWith('data: '))
      .map(line => JSON.parse(line.substring(6)));
  }

  private handleMessage(message: SseMessage) {
    switch (message.type) {
      case 'init':
        this.recordId = message.recordId!;
        this.onInit(message);
        break;
      case 'progress':
        this.onProgress(message);
        break;
      case 'complete':
        this.onComplete(message);
        break;
      case 'error':
        this.onError(message);
        break;
    }
  }

  cancel() {
    this.abortController?.abort();
  }

  // 回调方法（由子类实现或使用事件）
  onInit(message: SseMessage) {}
  onProgress(message: SseMessage) {}
  onComplete(message: SseMessage) {}
  onError(message: SseMessage) {}
  private getToken(): string { return ''; }
}
```

---

## 相关接口

| 接口 | 说明 |
|------|------|
| `POST /resume-ai/generate` | 同步生成简历（非SSE方式） |
| `POST /resume-ai/parse` | 解析简历内容 |
| `GET /resume/:id` | 获取生成的简历详情 |

---

## 更新日志

| 日期 | 版本 | 说明 |
|------|------|------|
| 2025-03-30 | v1.0 | 初始版本，实现SSE实时推送功能 |

---

*文档生成时间：2025-03-30*
*后端版本：基于 NestJS + MongoDB 实现*
