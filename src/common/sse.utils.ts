import type { Response } from 'express';

/**
 * 设置 SSE 流式响应头。
 *
 * X-Accel-Buffering: no 让 nginx 逐帧透传（否则代理会缓冲整个事件流）；
 * 调用前应先完成业务校验，保证校验失败能以标准 JSON 错误包络返回。
 */
export function initSseResponse(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
}

/** 写出一帧 SSE data 事件（自动 JSON 序列化） */
export function writeSseEvent(res: Response, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}
