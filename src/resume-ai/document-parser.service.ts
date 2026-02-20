import { Injectable, Logger } from '@nestjs/common';
import * as mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { getHeader } from 'pdf-parse/node';
import axios from 'axios';
/**
 * 文档解析服务
 * 支持从 URL 下载并解析 PDF、DOCX 等格式的简历文件
 */
@Injectable()
export class DocumentParserService {
  private readonly logger = new Logger(DocumentParserService.name);
  private readonly documentTypes = ['pdf', 'docx', 'doc'];
  private readonly maxFileSize = 10 * 1024 * 1024; // 10MB
  constructor() {}
  /**
   * 从url下载解析简历
   */
  async parserDocument(url: string) {
    if (!url) {
      throw new Error('url不能为空');
    }
    //验证url和文件类型是否正确
    const type = await this.validateUrl(url);
    let text = '';
    //判断对应的类型来决定解析方式
    if (type === 'pdf') {
      //解析pdf文件
      text = await this.parsePdf(url);
    } else {
      text = await this.parseDoc(url);
    }
    //清除多余的空白，特殊字符
    text = this.clearText(text);
    //检查解析后的文本质量
    const { isValidate, warnings } = this.validateTextQuality(text);
    if (!isValidate) {
      throw new Error(warnings.join(';'));
    }
    return text;
  }
  /**
   * 验证url和文件类型是否正确
   */
  private async validateUrl(url: string) {
    try {
      new URL(url);
      const type = url.split('.').pop() || '';
      if (!this.documentTypes.includes(type)) {
        throw new Error('文件类型错误');
      }
      const { size } = await getHeader(url, true);

      this.logger.log(`文件大小: ${size} bytes`);
      if (size && size > this.maxFileSize) {
        throw new Error('文件大小超过10MB');
      }
      return type;
    } catch (error) {
      throw new Error(error.message || 'url格式错误');
    }
  }

  /**
   * 解析pdf文件
   */
  async parsePdf(url: string) {
    const parser = new PDFParse({
      url,
      verbosity: 1, // 设置日志级别，1为ERRORS
    });
    const text = await parser.getText();
    parser.destroy();
    return text.text;
  }
  /**
   * 解析doc文件
   */
  async parseDoc(url: string) {
    this.logger.log('开始解析doc文件', url);
    let text;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const response = await axios.get<ArrayBuffer>(url, {
        responseType: 'arraybuffer',
      });
      const buffer = Buffer.from(response.data);
      text = await mammoth.extractRawText({
        buffer,
      });
    } else {
      text = await mammoth.extractRawText({
        path: url,
      });
    }
    if (!text.value) {
      throw new Error('解析doc文件失败');
    }
    this.logger.debug('解析doc文件成功', text.value);
    return text.value;
  }

  /**
   * 清除多余的空白，特殊字符
   */
  clearText(text: string) {
    if (!text) {
      return '';
    }
    return (
      text
        //统一换行符
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        //去除文字之前的空格
        .replace(/\s+/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .split('\n')
        .map((line) => line.trim())
        .join('\n')
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
        .replace(/ {2,}/g, ' ')
        .replace(/第\s*\d+\s*页/g, '')
        .replace(/Page\s+\d+/gi, '')
        .trim()
    );
  }

  /**
   * 检查解析后的文本质量
   */
  validateTextQuality(text: string) {
    const warnings: string[] = [];
    let isValidate = true;
    if (!text || text.length < 100) {
      warnings.push(
        '简历内容过短，建议包含基本信息、教育背景、工作经历、项目经历、技能图谱、联系方式等关键信息',
      );
      isValidate = false;
      ``;
    }
    // 检查是否包含基本信息、教育背景、工作经历、项目经历、技能图谱、联系方式等关键信息
    const keywords = [
      '姓名',
      '性别',
      '年龄',
      '手机',
      '电话',
      '邮箱',
      'email',
      '微信',
      // 教育经历
      '教育',
      '学历',
      '毕业',
      '大学',
      '学院',
      '专业',
      // 工作经历
      '工作',
      '经验',
      '项目',
      '公司',
      '职位',
      '岗位',
      // 技能
      '技能',
      '能力',
      '掌握',
      '熟悉',
      '精通',
    ];
    const filterKeyWords = keywords.filter((keyword) => text.includes(keyword));
    if (filterKeyWords.length < 5) {
      warnings.push(
        '简历内容缺失关键信息，建议包含基本信息、教育背景、工作经历、项目经历、技能图谱、联系方式等关键信息',
      );
      isValidate = false;
    }
    return {
      isValidate,
      warnings,
    };
  }
}
