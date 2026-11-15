import { BadRequestException } from '@nestjs/common';
import { open } from 'fs/promises';

/**
 * 上传类型校验（P0-6）
 *
 * 两道闸：
 * 1. 落盘扩展名由「声明 MIME → 白名单扩展名」推导，绝不使用 originalname，
 *    因此不可能往公开静态目录写出 .html/.js；
 * 2. 落盘后按魔数校验真实内容与声明类型是否一致，把「改名的 HTML/脚本」挡在门外。
 *
 * 之所以不用 file-type 之类的依赖：需要识别的类型就这 7 种，手写签名表更轻、
 * 也避免引入 ESM-only 的新依赖。
 */

/** 白名单：声明 MIME → 落盘扩展名 */
export const ALLOWED_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    '.docx',
};

/** 允许上传的 MIME 列表 */
export const ALLOWED_MIME_TYPES = Object.keys(ALLOWED_MIME_EXTENSIONS);

/**
 * 声明 MIME → 允许的真实内容类型（魔数推断结果）
 *
 * Word 的两种容器互相容忍：浏览器对 .doc/.docx 的 MIME 推断经常不准，
 * 过严会把合法上传误判成攻击。
 */
const COMPATIBLE_SNIFFED: Record<string, string[]> = {
  'image/jpeg': ['image/jpeg'],
  'image/png': ['image/png'],
  'image/gif': ['image/gif'],
  'image/webp': ['image/webp'],
  'application/pdf': ['application/pdf'],
  'application/msword': ['application/x-ole-storage', 'application/zip'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    'application/zip',
  ],
};

/** 由声明 MIME 推导安全的落盘扩展名；非白名单直接拒绝 */
export function extensionForMime(mimetype: string): string {
  const normalized = (mimetype ?? '').toLowerCase().trim();
  const extension = ALLOWED_MIME_EXTENSIONS[normalized];
  if (!extension) {
    throw new BadRequestException(
      `不支持的文件类型: ${mimetype}。允许的类型: ${ALLOWED_MIME_TYPES.join(', ')}`,
    );
  }
  return extension;
}

function startsWith(buffer: Buffer, signature: Buffer, offset = 0): boolean {
  if (buffer.length < offset + signature.length) {
    return false;
  }
  return buffer.subarray(offset, offset + signature.length).equals(signature);
}

/** 按魔数识别真实类型；识别不出来返回 null */
export function sniffMime(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 4) {
    return null;
  }
  if (
    startsWith(
      buffer,
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return 'image/png';
  }
  if (startsWith(buffer, Buffer.from([0xff, 0xd8, 0xff]))) {
    return 'image/jpeg';
  }
  if (
    startsWith(buffer, Buffer.from('GIF87a')) ||
    startsWith(buffer, Buffer.from('GIF89a'))
  ) {
    return 'image/gif';
  }
  if (
    startsWith(buffer, Buffer.from('RIFF')) &&
    startsWith(buffer, Buffer.from('WEBP'), 8)
  ) {
    return 'image/webp';
  }
  if (startsWith(buffer, Buffer.from('%PDF'))) {
    return 'application/pdf';
  }
  if (
    startsWith(buffer, Buffer.from([0x50, 0x4b, 0x03, 0x04])) ||
    startsWith(buffer, Buffer.from([0x50, 0x4b, 0x05, 0x06])) ||
    startsWith(buffer, Buffer.from([0x50, 0x4b, 0x07, 0x08]))
  ) {
    return 'application/zip';
  }
  if (
    startsWith(
      buffer,
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    )
  ) {
    return 'application/x-ole-storage';
  }
  return null;
}

/** 断言真实内容与声明类型一致，否则抛 400 */
export function assertContentMatchesMime(
  declaredMime: string,
  buffer: Buffer,
): void {
  const normalized = (declaredMime ?? '').toLowerCase().trim();
  const compatible = COMPATIBLE_SNIFFED[normalized];
  if (!compatible) {
    throw new BadRequestException(`不支持的文件类型: ${declaredMime}`);
  }

  const sniffed = sniffMime(buffer);
  if (!sniffed) {
    throw new BadRequestException('无法识别文件内容，已拒绝上传');
  }
  if (!compatible.includes(sniffed)) {
    throw new BadRequestException(
      `文件内容与声明的类型不一致（声明 ${declaredMime}，实际 ${sniffed}）`,
    );
  }
}

/** 读取文件头部若干字节用于魔数校验 */
export async function readFileHeader(
  filePath: string,
  length = 32,
): Promise<Buffer> {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
