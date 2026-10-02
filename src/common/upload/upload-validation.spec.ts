import { BadRequestException } from '@nestjs/common';
import {
  ALLOWED_MIME_TYPES,
  assertContentMatchesMime,
  extensionForMime,
  sniffMime,
} from './upload-validation';

/**
 * 上传类型校验（P0-6）
 *
 * 修复前 fileFilter 只信客户端提交的 mimetype，落盘扩展名取自 originalname，
 * 于是把 HTML 改名成 x.html、mimetype 伪报成 image/png 就能在公开静态目录
 * /uploads/ 下托管同源页面与脚本（存储型 XSS）。
 *
 * 现在的两道闸：
 * 1. 落盘扩展名由声明 MIME 的白名单推导，绝不使用 originalname；
 * 2. 落盘后按魔数校验文件真实内容与声明类型是否一致。
 */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64),
]);
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32)]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x20, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP'),
  Buffer.alloc(32),
]);
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(32)]);
const DOCX_ZIP = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.alloc(32),
]);
const DOC_OLE2 = Buffer.concat([
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  Buffer.alloc(32),
]);
const HTML = Buffer.from('<!DOCTYPE html><script>alert(1)</script>');

describe('extensionForMime', () => {
  it('白名单 MIME 映射到安全的落盘扩展名', () => {
    expect(extensionForMime('image/png')).toBe('.png');
    expect(extensionForMime('image/jpeg')).toBe('.jpg');
    expect(extensionForMime('image/gif')).toBe('.gif');
    expect(extensionForMime('image/webp')).toBe('.webp');
    expect(extensionForMime('application/pdf')).toBe('.pdf');
    expect(extensionForMime('application/msword')).toBe('.doc');
    expect(
      extensionForMime(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBe('.docx');
  });

  it('非白名单 MIME 一律拒绝（含 html/js/svg）', () => {
    for (const mime of [
      'text/html',
      'application/javascript',
      'image/svg+xml',
      'application/octet-stream',
      '',
    ]) {
      expect(() => extensionForMime(mime)).toThrow(BadRequestException);
    }
  });

  it('白名单里没有任何可被浏览器执行脚本的扩展名', () => {
    for (const mime of ALLOWED_MIME_TYPES) {
      expect(['.html', '.htm', '.js', '.svg', '.xml']).not.toContain(
        extensionForMime(mime),
      );
    }
  });
});

describe('sniffMime', () => {
  it('识别常见真实类型', () => {
    expect(sniffMime(PNG)).toBe('image/png');
    expect(sniffMime(JPEG)).toBe('image/jpeg');
    expect(sniffMime(GIF)).toBe('image/gif');
    expect(sniffMime(WEBP)).toBe('image/webp');
    expect(sniffMime(PDF)).toBe('application/pdf');
    expect(sniffMime(DOCX_ZIP)).toBe('application/zip');
    expect(sniffMime(DOC_OLE2)).toBe('application/x-ole-storage');
  });

  it('认不出来的一律返回 null（含 HTML 与空内容）', () => {
    expect(sniffMime(HTML)).toBeNull();
    expect(sniffMime(Buffer.alloc(0))).toBeNull();
    expect(sniffMime(Buffer.from([1, 2, 3, 4]))).toBeNull();
  });

  it('伪造 RIFF 头但不是 WEBP 时不误判', () => {
    const fakeRiff = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0x20, 0x00, 0x00, 0x00]),
      Buffer.from('WAVE'),
      Buffer.alloc(16),
    ]);
    expect(sniffMime(fakeRiff)).toBeNull();
  });
});

describe('assertContentMatchesMime', () => {
  it('内容与声明一致时放行', () => {
    expect(() => assertContentMatchesMime('image/png', PNG)).not.toThrow();
    expect(() => assertContentMatchesMime('image/jpeg', JPEG)).not.toThrow();
    expect(() =>
      assertContentMatchesMime('application/pdf', PDF),
    ).not.toThrow();
  });

  it('把 HTML 伪报成图片时拒绝（这就是存储型 XSS 的入口）', () => {
    expect(() => assertContentMatchesMime('image/png', HTML)).toThrow(
      BadRequestException,
    );
  });

  it('图片之间互相伪装也要拒绝', () => {
    expect(() => assertContentMatchesMime('image/png', JPEG)).toThrow(
      BadRequestException,
    );
    expect(() => assertContentMatchesMime('application/pdf', PNG)).toThrow(
      BadRequestException,
    );
  });

  it('Word 两种容器互相容忍（浏览器对 .doc 的 MIME 推断常不准）', () => {
    const docxMime =
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    expect(() => assertContentMatchesMime(docxMime, DOCX_ZIP)).not.toThrow();
    expect(() =>
      assertContentMatchesMime('application/msword', DOC_OLE2),
    ).not.toThrow();
    expect(() =>
      assertContentMatchesMime('application/msword', DOCX_ZIP),
    ).not.toThrow();
  });

  it('声明类型不在白名单时直接拒绝', () => {
    expect(() => assertContentMatchesMime('text/html', HTML)).toThrow(
      BadRequestException,
    );
  });
});
