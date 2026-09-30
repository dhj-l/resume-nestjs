/**
 * 简历模块排序字段（globalSort / localSort）归一化工具
 *
 * 背景：AI 输出的 globalSort 可能缺失（落库被 schema default 补成 0）或
 * 多个模块同值（例如 projectExperience 与 internshipExperience 都是 3）。
 * 前端"交换式排序"对相等值是空操作，会导致模块无法排序，因此所有写入
 * 简历模块数据的入口都必须保证模块级 globalSort 唯一且为正整数。
 *
 * 归一化策略：按各模块代表值稳定排序后重编为连续唯一值（1..n）：
 * - 模块间相对顺序完全保留 AI/用户的设计，仅收敛数值；
 * - 缺失值（0/非正数）按 prompt 默认序号补位参与排序；
 * - 数组模块内条目统一为同一 globalSort，localSort 按既有顺序重编为 1..n。
 */

/**
 * 参与排序的模块字段及 prompt 约定的默认序号
 * （与 common-constraints 排序规范保持一致）
 */
export const SORTABLE_MODULE_SORT: ReadonlyArray<readonly [string, number]> = [
  ['workExperience', 1],
  ['projectExperience', 2],
  ['educationBackground', 3],
  ['internshipExperience', 4],
  ['campusExperience', 5],
  ['skills', 6],
  ['certificates', 7],
  ['selfEvaluation', 8],
];

export interface ModuleSortPlanEntry {
  /** 简历模块字段名 */
  field: string;
  /** prompt 约定的默认序号 */
  defaultSort: number;
  /** 归一化后的模块级排序值（1..n，唯一） */
  rank: number;
  /** 参与排序的代表值：模块内首项/对象字段的 globalSort，缺失时回退默认序号 */
  representative: number;
  /** 模块是否有内容可写回（非空数组或对象） */
  present: boolean;
  /** 代表值非法（非正数）或与其它在场模块重复 */
  conflicted: boolean;
}

/**
 * 提取模块的排序代表值
 *
 * 0 视为缺失：AI 遗漏 globalSort 时，落库的 $set 会被 schema 的
 * default: 0 补齐（mongoose cast），lean 读出的值就是 0；且 prompt
 * 约定合法值必须为正整数。0 若按真实值参与排序，缺失模块会排到
 * 所有有效模块之前，破坏 AI 明确的模块顺序。
 */
export const readRepresentativeSort = (
  value: any,
  defaultSort: number,
): number => {
  const raw = Number(value?.globalSort ?? 0);
  return Number.isFinite(raw) && raw > 0 ? raw : defaultSort;
};

/** 读取原始 globalSort（非正数/非法值统一视为 0，用于冲突判定） */
const readRawSort = (value: any): number => {
  const raw = Number(value?.globalSort ?? 0);
  return Number.isFinite(raw) ? raw : 0;
};

/** 读取单个模块的在场状态、原始值与代表值 */
const readModuleSortState = (
  value: any,
  defaultSort: number,
): { present: boolean; raw: number; representative: number } => {
  if (Array.isArray(value)) {
    if (!value.length) {
      return { present: false, raw: 0, representative: defaultSort };
    }
    return {
      present: true,
      raw: readRawSort(value[0]),
      representative: readRepresentativeSort(value[0], defaultSort),
    };
  }

  if (value && typeof value === 'object') {
    return {
      present: true,
      raw: readRawSort(value),
      representative: readRepresentativeSort(value, defaultSort),
    };
  }

  return { present: false, raw: 0, representative: defaultSort };
};

/**
 * 计算归一化后的模块顺序计划（按代表值稳定排序，同值按默认序号决胜）
 */
export const planModuleSort = (
  doc: Record<string, any> | null | undefined,
): ModuleSortPlanEntry[] => {
  const entries = SORTABLE_MODULE_SORT.map(([field, defaultSort]) => {
    const state = readModuleSortState(doc?.[field], defaultSort);
    return { field, defaultSort, ...state };
  });

  entries.sort(
    (a, b) =>
      a.representative - b.representative || a.defaultSort - b.defaultSort,
  );

  const representativeCounts = new Map<number, number>();
  for (const entry of entries) {
    if (!entry.present) continue;
    representativeCounts.set(
      entry.representative,
      (representativeCounts.get(entry.representative) ?? 0) + 1,
    );
  }

  return entries.map((entry, index) => ({
    field: entry.field,
    defaultSort: entry.defaultSort,
    rank: index + 1,
    representative: entry.representative,
    present: entry.present,
    conflicted:
      entry.present &&
      (entry.raw <= 0 ||
        (representativeCounts.get(entry.representative) ?? 0) > 1),
  }));
};

/** 模块是否存在排序冲突（重复或非正代表值） */
export const hasModuleSortConflict = (plan: ModuleSortPlanEntry[]): boolean =>
  plan.some((entry) => entry.conflicted);

/**
 * 按计划产出各模块归一化后的完整内容（数组整组替换，对象字段覆盖 globalSort）
 */
const buildModuleValues = (
  doc: Record<string, any> | null | undefined,
  plan: ModuleSortPlanEntry[],
): Array<[string, any]> => {
  const values: Array<[string, any]> = [];

  for (const entry of plan) {
    const value = doc?.[entry.field];
    if (Array.isArray(value)) {
      if (!value.length) continue;
      // 按既有 localSort 稳定排序后重编，保留条目相对顺序
      const items = [...value].sort(
        (a: any, b: any) => (a?.localSort ?? 0) - (b?.localSort ?? 0),
      );
      values.push([
        entry.field,
        items.map((item: any, i: number) => ({
          ...item,
          globalSort: entry.rank,
          localSort: i + 1,
        })),
      ]);
    } else if (value && typeof value === 'object') {
      values.push([entry.field, { ...value, globalSort: entry.rank }]);
    }
  }

  return values;
};

/**
 * 生成可直接用于 `$set` 的排序修复载荷
 *
 * @param doc 简历文档（lean 对象或 toObject() 结果）
 * @param options.onlyOnConflict 仅当存在重复/非正代表值时才返回载荷，
 *   正常（模块级值唯一）时返回空对象，保证用户正常换序零副作用
 */
export const buildModuleSortUpdate = (
  doc: Record<string, any> | null | undefined,
  options: { onlyOnConflict?: boolean } = {},
): Record<string, any> => {
  const plan = planModuleSort(doc);
  if (options.onlyOnConflict && !hasModuleSortConflict(plan)) {
    return {};
  }

  const update: Record<string, any> = {};
  for (const [field, value] of buildModuleValues(doc, plan)) {
    if (Array.isArray(value)) {
      update[field] = value;
    } else {
      // 对象模块只覆盖 globalSort，避免整体替换丢失并发写入的其它字段
      update[`${field}.globalSort`] = value.globalSort;
    }
  }

  return update;
};

/**
 * 生成文档形态的归一化结果（落库前使用：对象模块整体合并，不产生点号键）
 *
 * @param options.onlyOnConflict 仅当存在冲突时才归一化，否则原样返回
 */
export const applyModuleSortNormalization = <
  T extends Record<string, any> | null | undefined,
>(
  doc: T,
  options: { onlyOnConflict?: boolean } = {},
): T => {
  const plan = planModuleSort(doc);
  if (options.onlyOnConflict && !hasModuleSortConflict(plan)) {
    return doc;
  }

  const normalized: Record<string, any> = { ...(doc ?? {}) };
  for (const [field, value] of buildModuleValues(doc, plan)) {
    normalized[field] = value;
  }
  return normalized as T;
};
