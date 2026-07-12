import { Test, TestingModule } from '@nestjs/testing';
import { DocumentParserService } from './document-parser.service';

// Mock pdf-parse
jest.mock('pdf-parse', () => {
  return {
    PDFParse: jest.fn().mockImplementation(() => ({
      getText: jest.fn().mockResolvedValue({ text: 'mocked pdf text' }),
      destroy: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

jest.mock('pdf-parse/node', () => ({
  getHeader: jest.fn().mockResolvedValue({ size: 1024 }),
}));

describe('DocumentParserService', () => {
  let service: DocumentParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentParserService],
    }).compile();

    service = module.get<DocumentParserService>(DocumentParserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('clearText', () => {
    it('should return empty string for null/undefined/empty input', () => {
      expect(service.clearText('')).toBe('');
      expect(service.clearText(null as unknown as string)).toBe('');
      expect(service.clearText(undefined as unknown as string)).toBe('');
    });

    it('should preserve spaces between words', () => {
      const input = 'Hello World Test';
      expect(service.clearText(input)).toBe('Hello World Test');
    });

    it('should collapse multiple spaces into single space', () => {
      const input = 'Hello   World   Test';
      expect(service.clearText(input)).toBe('Hello World Test');
    });

    it('should normalize line breaks', () => {
      const input = 'line1\r\nline2\rline3\nline4';
      expect(service.clearText(input)).toBe('line1\nline2\nline3\nline4');
    });

    it('should collapse multiple empty lines into at most two', () => {
      const input = 'line1\n\n\n\n\nline2';
      expect(service.clearText(input)).toBe('line1\n\nline2');
    });

    it('should trim each line', () => {
      const input = '  line1  \n  line2  ';
      expect(service.clearText(input)).toBe('line1\nline2');
    });

    it('should remove page number markers in Chinese', () => {
      const input = '内容第 1 页更多内容第2页';
      expect(service.clearText(input)).toBe('内容更多内容');
    });

    it('should remove page number markers in English', () => {
      const input = 'Content Page 1 more content Page 2';
      expect(service.clearText(input)).toBe('Content  more content');
    });

    it('should handle mixed Chinese and English content', () => {
      const input = `姓名：张三
工作经历：Google 工程师
技能：JavaScript, TypeScript`;
      expect(service.clearText(input)).toBe(input);
    });

    it('should handle realistic resume content', () => {
      const input = `姓名：张三
性别：男
年龄：28

教育背景
北京大学
计算机科学与技术专业

工作经历
Google
高级工程师
2020-至今`;

      const expected = `姓名：张三
性别：男
年龄：28

教育背景
北京大学
计算机科学与技术专业

工作经历
Google
高级工程师
2020-至今`;

      expect(service.clearText(input)).toBe(expected);
    });
  });

  describe('validateTextQuality', () => {
    it('should reject text shorter than 100 characters', () => {
      const result = service.validateTextQuality('short text');
      expect(result.isValidate).toBe(false);
      expect(result.warnings[0]).toContain('简历内容过短');
    });

    it('should reject empty text', () => {
      const result = service.validateTextQuality('');
      expect(result.isValidate).toBe(false);
    });

    it('should reject text with fewer than 5 keywords', () => {
      const text = '这是一段很长的文本但是不包含任何简历关键字'.repeat(10);
      const result = service.validateTextQuality(text);
      expect(result.isValidate).toBe(false);
      expect(result.warnings[0]).toContain('缺失关键信息');
    });

    it('should accept text with 5 or more keywords', () => {
      const text =
        '姓名：张三，性别：男，年龄：28，手机：13800138000，邮箱：test@example.com，教育背景：北京大学计算机专业毕业，工作经历：高级工程师，项目经验丰富，技能：精通JavaScript，熟悉TypeScript，掌握Node.js';
      const result = service.validateTextQuality(text);
      expect(result.isValidate).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should count keywords correctly', () => {
      const text =
        '姓名：张三，性别：男，年龄：28岁，手机：13800138000，邮箱：test@example.com，教育背景：北京大学计算机专业毕业，工作经历：高级工程师，项目经验丰富，技能：精通JavaScript，熟悉TypeScript，掌握Node.js，了解Python，熟悉数据库设计';
      const result = service.validateTextQuality(text);
      expect(result.isValidate).toBe(true);
    });
  });

  describe('parsePdf', () => {
    it('should parse pdf and return text', async () => {
      const { PDFParse } = require('pdf-parse');
      const result = await service.parsePdf('https://example.com/test.pdf');
      expect(result).toBe('mocked pdf text');
      expect(PDFParse).toHaveBeenCalledWith({
        url: 'https://example.com/test.pdf',
        verbosity: 1,
      });
    });

    it('should call destroy after parsing', async () => {
      const mockDestroy = jest.fn().mockResolvedValue(undefined);
      const { PDFParse } = require('pdf-parse');
      PDFParse.mockImplementation(() => ({
        getText: jest.fn().mockResolvedValue({ text: 'text' }),
        destroy: mockDestroy,
      }));

      await service.parsePdf('https://example.com/test.pdf');
      expect(mockDestroy).toHaveBeenCalled();
    });

    it('should call destroy even if getText fails', async () => {
      const mockDestroy = jest.fn().mockResolvedValue(undefined);
      const { PDFParse } = require('pdf-parse');
      PDFParse.mockImplementation(() => ({
        getText: jest.fn().mockRejectedValue(new Error('parse error')),
        destroy: mockDestroy,
      }));

      await expect(
        service.parsePdf('https://example.com/test.pdf'),
      ).rejects.toThrow('parse error');
      expect(mockDestroy).toHaveBeenCalled();
    });

    it('should pass correct ParseParameters', async () => {
      const mockGetText = jest.fn().mockResolvedValue({ text: 'text' });
      const { PDFParse } = require('pdf-parse');
      PDFParse.mockImplementation(() => ({
        getText: mockGetText,
        destroy: jest.fn().mockResolvedValue(undefined),
      }));

      await service.parsePdf('https://example.com/test.pdf');
      expect(mockGetText).toHaveBeenCalledWith({
        lineEnforce: true,
        lineThreshold: 4.6,
        pageJoiner: '\n',
      });
    });
  });

  describe('parserDocument', () => {
    it('should throw error for empty url', async () => {
      await expect(service.parserDocument('')).rejects.toThrow(
        '文件路径或URL不能为空',
      );
    });

    it('should throw error for invalid url format', async () => {
      await expect(service.parserDocument('not-a-url')).rejects.toThrow();
    });
  });
});
