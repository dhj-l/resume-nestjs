export const RESUME_MIN_LENGTH = 100;
export const RESUME_MAX_LENGTH = 100000;

export const RESUME_MIN_PARAGRAPHS = 3;
export const RESUME_MIN_LINE_BREAKS = 10;
export const RESUME_MIN_DATE_COUNT = 2;
export const RESUME_PASSING_SCORE = 60;

export const RESUME_KEYWORD_GROUPS = [
  {
    name: 'personalInfo',
    keywords: [
      '姓名',
      '电话',
      '手机',
      '邮箱',
      '联系方式',
      '性别',
      '年龄',
      '出生',
      '住址',
      '地址',
      '籍贯',
      '婚姻',
      '政治面貌',
    ],
    synonyms: [
      ['姓名', '名字', '真实姓名'],
      ['电话', '手机', '联系电话', '手机号码', '电话号码'],
      ['邮箱', '电子邮箱', '电子邮件', 'email', 'E-mail'],
      ['联系方式', '联系信息', '通讯方式'],
    ],
  },
  {
    name: 'education',
    keywords: [
      '学校',
      '大学',
      '学院',
      '学历',
      '专业',
      '毕业',
      '学位',
      '本科',
      '硕士',
      '博士',
      '大专',
      '中专',
      '高中',
      '初中',
      '研究生',
      '学士',
      '硕士',
      '博士',
      'university',
      'college',
      'education',
      'degree',
      'major',
      'graduated',
      'bachelor',
      'master',
      'doctor',
      'phd',
    ],
    synonyms: [
      ['学校', '院校', '毕业院校', '就读学校'],
      ['学历', '最高学历', '教育背景', '教育程度'],
      ['专业', '所学专业', '主修专业'],
      ['毕业', '毕业于', '毕业时间'],
    ],
  },
  {
    name: 'workExperience',
    keywords: [
      '工作',
      '公司',
      '职位',
      '岗位',
      '任职',
      '离职',
      '在职',
      '就职',
      '经历',
      '职责',
      '工作内容',
      '工作描述',
      'work',
      'company',
      'position',
      'job',
      'employment',
      'experience',
    ],
    synonyms: [
      ['工作经历', '工作经验', '从业经历', '工作背景'],
      ['公司', '企业', '单位', '所在公司'],
      ['职位', '岗位', '职务', '职称', '担任'],
      ['任职', '就职', '入职', '工作期间'],
    ],
  },
  {
    name: 'skills',
    keywords: [
      '技能',
      '特长',
      '能力',
      '熟练',
      '掌握',
      '熟悉',
      '精通',
      '擅长',
      '证书',
      '资格',
      '认证',
      '荣誉',
      '奖项',
      'skills',
      'abilities',
      'proficient',
      'expert',
      'master',
      'certificate',
    ],
    synonyms: [
      ['技能', '专业技能', '技术能力', '核心技能'],
      ['特长', '个人特长', '专长'],
      ['熟练', '精通', '掌握', '熟悉'],
      ['证书', '资格证书', '职业证书', '资质证书'],
    ],
  },
  {
    name: 'project',
    keywords: [
      '项目',
      '负责',
      '参与',
      '开发',
      '实现',
      '项目经历',
      '项目经验',
      'project',
      'developed',
      'implemented',
      'responsible',
    ],
    synonyms: [
      ['项目', '项目名称', '项目经历', '项目经验'],
      ['负责', '负责开发', '主导', '核心开发'],
      ['参与', '参与开发', '参与项目'],
    ],
  },
  {
    name: 'selfEvaluation',
    keywords: [
      '自我评价',
      '个人总结',
      '职业规划',
      '求职意向',
      '期望',
      '目标',
      'self-evaluation',
      'summary',
      'career',
      'objective',
      'goal',
    ],
    synonyms: [
      ['自我评价', '个人评价', '自我介绍', '个人简介'],
      ['求职意向', '期望职位', '意向岗位', '求职目标'],
      ['职业规划', '职业目标', '发展规划'],
    ],
  },
];

export const RESUME_REQUIRED_KEYWORD_GROUPS = 2;

/**
 * 强制必填的关键词组
 * 简历必须同时包含以下关键词组才能通过校验
 */
export const REQUIRED_KEYWORD_GROUPS = ['personalInfo', 'education'];

/**
 * 可选的关键词组
 * 这些信息不是必填的，但包含后会提高简历质量评分
 */
export const OPTIONAL_KEYWORD_GROUPS = [
  'workExperience',
  'skills',
  'project',
  'selfEvaluation',
];

export const DATE_PATTERNS = [
  /\d{4}[-/年]\d{1,2}[-/月]?\d{0,2}[日]?/g,
  /\d{4}\.\d{1,2}(\.\d{1,2})?/g,
  /\d{2}\/\d{2}\/\d{4}/g,
  /\d{1,2}[-/]\d{4}/g,
  /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{4}/gi,
  /\d{4}\s*(年|year)/g,
];

export const PHONE_PATTERN =
  /(?:电话|手机|联系方式|phone|tel|mobile)[:：\s]*([1-9]\d{10}|[\d\-+\s]{7,15})/gi;
export const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
export const NAME_PATTERN = /(?:姓名|名字|name)[:：\s]*([^\n\r]{2,10})/gi;

export const NON_RESUME_KEYWORDS = [
  '岗位职责',
  '任职要求',
  '招聘',
  '薪资待遇',
  '工作地点',
  'job description',
  'hiring',
  'salary',
  'benefits',
  '文章',
  '新闻',
  '报道',
  '小说',
  '故事',
  '诗歌',
  'article',
  'news',
  'story',
  'novel',
  'poem',
];

export const RESUME_VALIDATION_MESSAGES = {
  CN: {
    tooShort: `简历内容过短，至少需要${RESUME_MIN_LENGTH}个字符`,
    tooLong: `简历内容过长，最大允许${RESUME_MAX_LENGTH}个字符`,
    insufficientStructure: '简历结构不完整，需包含更多段落或换行',
    missingPersonalInfo: '缺少个人信息（姓名、联系方式等）',
    missingEducation: '缺少教育背景信息',
    missingWorkExperience: '缺少工作或实习经历',
    missingSkills: '缺少技能特长描述',
    missingTimeFormat: '缺少有效的时间格式（如工作时间段）',
    invalidContent: '内容可能不是有效的简历文档',
    nonResumeContent: '检测到非简历内容特征，请确认是否为简历文档',
    missingRequiredFields: '简历必须同时包含个人信息和教育背景信息才能通过校验',
  },
  EN: {
    tooShort: `Resume content is too short. Minimum ${RESUME_MIN_LENGTH} characters required.`,
    tooLong: `Resume content is too long. Maximum ${RESUME_MAX_LENGTH} characters allowed.`,
    insufficientStructure:
      'Resume structure is incomplete. More paragraphs or line breaks needed.',
    missingPersonalInfo:
      'Missing personal information (name, contact details, etc.)',
    missingEducation: 'Missing education background information.',
    missingWorkExperience: 'Missing work or internship experience.',
    missingSkills: 'Missing skills or abilities description.',
    missingTimeFormat: 'Missing valid time formats (e.g., employment periods).',
    invalidContent: 'Content may not be a valid resume document.',
    nonResumeContent:
      'Non-resume content detected. Please confirm if this is a resume.',
    missingRequiredFields:
      'Resume must contain both personal information and education background to pass validation.',
  },
};

export interface ValidationDetails {
  hasPersonalInfo: boolean;
  hasEducation: boolean;
  hasWorkExperience: boolean;
  hasSkills: boolean;
  hasProject: boolean;
  hasSelfEvaluation: boolean;
  hasTimeFormat: boolean;
  hasContactInfo: boolean;
  matchedKeywordGroups: string[];
  contentLength: number;
  paragraphCount: number;
  lineBreakCount: number;
  dateCount: number;
}

export interface ValidationResult {
  isValid: boolean;
  reason: string;
  errors: string[];
  score: number;
  details: ValidationDetails;
}

export function matchResumeKeywordGroup(
  text: string,
  group: (typeof RESUME_KEYWORD_GROUPS)[0],
): boolean {
  const lowerText = text.toLowerCase();

  for (const keyword of group.keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      return true;
    }
  }

  for (const synonymGroup of group.synonyms) {
    for (const synonym of synonymGroup) {
      if (lowerText.includes(synonym.toLowerCase())) {
        return true;
      }
    }
  }

  return false;
}

export function countDatePatterns(text: string): number {
  let count = 0;
  for (const pattern of DATE_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      count += matches.length;
    }
  }
  return count;
}

export function hasContactInfo(text: string): boolean {
  return PHONE_PATTERN.test(text) || EMAIL_PATTERN.test(text);
}

export function hasNonResumeContent(text: string): boolean {
  const lowerText = text.toLowerCase();
  let matchCount = 0;

  for (const keyword of NON_RESUME_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      matchCount++;
    }
  }

  return matchCount >= 3;
}
