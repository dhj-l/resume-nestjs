export const MIN_LENGTH = 150;
export const MAX_LENGTH = 5000;

export const MIN_CHINESE_LENGTH = 150;
export const MIN_ENGLISH_LENGTH = 300;
export const MIN_PARAGRAPHS = 2;
export const MIN_LINE_BREAKS = 5;

export const JD_KEYWORD_GROUPS = [
  {
    name: 'position',
    keywords: ['职位', '岗位', 'position', 'role', 'title', '招聘'],
    synonyms: [
      ['职位', '岗位', '职务'],
      ['position', 'role', 'job title'],
    ],
  },
  {
    name: 'location',
    keywords: [
      '工作地点',
      '地点',
      '地址',
      'location',
      'address',
      '工作城市',
      'base地',
    ],
    synonyms: [
      ['工作地点', '工作城市', '工作地址', '办公地点'],
      ['location', 'work location', 'workplace'],
    ],
  },
  {
    name: 'responsibility',
    keywords: [
      '岗位职责',
      '职责',
      '工作内容',
      'responsibilities',
      'duties',
      '工作职责',
      '岗位描述',
    ],
    synonyms: [
      ['岗位职责', '工作职责', '职责描述', '工作内容', '主要职责'],
      ['responsibilities', 'duties', 'job description', 'key responsibilities'],
    ],
  },
  {
    name: 'requirements',
    keywords: [
      '任职要求',
      '要求',
      '资格',
      'requirements',
      'qualifications',
      '任职资格',
      '招聘要求',
    ],
    synonyms: [
      ['任职要求', '招聘要求', '任职资格', '岗位要求', '应聘要求'],
      [
        'requirements',
        'qualifications',
        'job requirements',
        'minimum qualifications',
      ],
    ],
  },
  {
    name: 'education',
    keywords: [
      '学历',
      'education',
      '学位',
      'degree',
      '本科',
      '硕士',
      '博士',
      '大专',
      '学历要求',
    ],
    synonyms: [
      ['学历', '学历要求', '教育背景', '最高学历'],
      ['education', 'degree', 'educational background'],
    ],
  },
  {
    name: 'salary',
    keywords: [
      '薪资',
      'salary',
      '薪酬',
      '待遇',
      '工资',
      '月薪',
      '年薪',
      '薪资范围',
      '薪酬福利',
    ],
    synonyms: [
      ['薪资', '薪酬', '工资', '待遇', '薪资待遇'],
      ['salary', 'compensation', 'pay', 'wage'],
    ],
  },
  {
    name: 'company',
    keywords: [
      '公司',
      'company',
      '企业',
      'firm',
      '公司介绍',
      '企业介绍',
      '关于我们',
    ],
    synonyms: [
      ['公司', '企业', '用人单位', '招聘单位'],
      ['company', 'company introduction', 'about us'],
    ],
  },
  {
    name: 'experience',
    keywords: ['经验', 'experience', '工作年限', '工作经验', '从业经验'],
    synonyms: [
      ['工作经验', '工作年限', '从业经验', '相关经验'],
      ['experience', 'work experience', 'years of experience'],
    ],
  },
];

export const JD_REQUIRED_KEYWORD_COUNT = 3;

export const DISCRIMINATORY_TERMS_CN = [
  '仅限男性',
  '仅限女性',
  '限男性',
  '限女性',
  '男士优先',
  '女士优先',
  '年龄限制',
  '只招',
  '不招',
];

export const DISCRIMINATORY_TERMS_EN = [
  'male only',
  'female only',
  'men only',
  'women only',
  'age limit',
];

export const PROHIBITED_TERMS = [
  ...DISCRIMINATORY_TERMS_CN,
  ...DISCRIMINATORY_TERMS_EN,
];

export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

export function fuzzyMatch(
  text: string,
  keyword: string,
  maxDistance: number = 2,
): boolean {
  if (text.includes(keyword)) {
    return true;
  }

  const lowerText = text.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();

  if (lowerText.includes(lowerKeyword)) {
    return true;
  }

  const words = text.split(/[\s,，、;；]+/);
  for (const word of words) {
    const distance = levenshteinDistance(word.toLowerCase(), lowerKeyword);
    if (distance <= maxDistance) {
      return true;
    }
  }

  return false;
}

export function matchKeywordGroup(
  text: string,
  group: (typeof JD_KEYWORD_GROUPS)[0],
): boolean {
  for (const keyword of group.keywords) {
    if (fuzzyMatch(text, keyword)) {
      return true;
    }
  }

  for (const synonymGroup of group.synonyms) {
    for (const synonym of synonymGroup) {
      if (fuzzyMatch(text, synonym)) {
        return true;
      }
    }
  }

  return false;
}

export const VALIDATION_MESSAGES = {
  CN: {
    tooShort: 'JD内容过短，中文需至少150字符，英文需至少300字符',
    tooLong: `JD内容过长，最大允许${MAX_LENGTH}字符`,
    insufficientParagraphs: 'JD格式异常，需至少包含2个段落或5个换行符',
    missingKeywords:
      'JD缺少必要的关键信息字段（职位、地点、职责、要求、学历、薪资、公司信息等），请补充完善',
    discriminatoryContent: 'JD包含歧视性内容，请修改后重新提交',
  },
  EN: {
    tooShort:
      'Job description is too short. Minimum 150 Chinese characters or 300 English characters required.',
    tooLong: `Job description is too long. Maximum ${MAX_LENGTH} characters allowed.`,
    insufficientParagraphs:
      'Invalid format. At least 2 paragraphs or 5 line breaks required.',
    missingKeywords:
      'Missing essential fields (position, location, responsibilities, requirements, education, salary, company info).',
    discriminatoryContent:
      'Discriminatory content detected. Please revise and resubmit.',
  },
};

/**
 * 按中英文占比返回最低长度要求（中文占优用中文门槛，否则用英文门槛）。
 * 押题分析（resume-ai）与模拟面试（interview）共用同一判定。
 */
export function getEffectiveMinLength(text: string): number {
  const chineseCharCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const isChineseDominant = chineseCharCount > text.length * 0.3;
  return isChineseDominant ? MIN_CHINESE_LENGTH : MIN_ENGLISH_LENGTH;
}

/** 是否具备足够的段落结构（空行分段或换行数达标） */
export function hasEnoughParagraphs(text: string): boolean {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const lineBreaks = (text.match(/\n/g) || []).length;
  return paragraphs.length >= MIN_PARAGRAPHS || lineBreaks >= MIN_LINE_BREAKS;
}

/** 是否包含歧视性/违禁表述 */
export function hasDiscriminatoryContent(text: string): boolean {
  const lowerText = text.toLowerCase();
  return PROHIBITED_TERMS.some((term) =>
    lowerText.includes(term.toLowerCase()),
  );
}
