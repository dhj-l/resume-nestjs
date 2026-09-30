import {
  SORTABLE_MODULE_SORT,
  applyModuleSortNormalization,
  buildModuleSortUpdate,
  planModuleSort,
  readRepresentativeSort,
} from './module-sort.util';

describe('module-sort.util — 简历模块排序字段归一化', () => {
  describe('readRepresentativeSort', () => {
    it('正整数按真实值参与排序', () => {
      expect(readRepresentativeSort({ globalSort: 5 }, 2)).toBe(5);
    });

    it('缺失或非正值回退默认序号（0 是 schema default 补出来的缺失形态）', () => {
      expect(readRepresentativeSort({ globalSort: 0 }, 2)).toBe(2);
      expect(readRepresentativeSort({}, 2)).toBe(2);
      expect(readRepresentativeSort(undefined, 2)).toBe(2);
      expect(readRepresentativeSort({ globalSort: -1 }, 2)).toBe(2);
      expect(readRepresentativeSort({ globalSort: 'abc' }, 2)).toBe(2);
    });
  });

  describe('planModuleSort', () => {
    it('保序重编为 1..n 且 rank 唯一', () => {
      const plan = planModuleSort({
        workExperience: [{ globalSort: 5 }],
        educationBackground: [{ globalSort: 1 }],
        projectExperience: [{ globalSort: 0 }],
        skills: { globalSort: 0 },
      });

      const ranks = plan.map((entry) => entry.rank);
      expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(new Set(ranks).size).toBe(SORTABLE_MODULE_SORT.length);

      const byField = Object.fromEntries(plan.map((e) => [e.field, e]));
      // 缺失值（0）按 prompt 默认序号补位，不得抢占 AI 指定的顺序
      expect(byField.educationBackground.rank).toBe(1);
      expect(byField.educationBackground.representative).toBe(1);
      expect(byField.projectExperience.rank).toBe(2);
      expect(byField.projectExperience.representative).toBe(2);
      expect(byField.internshipExperience.rank).toBe(3);
      expect(byField.workExperience.rank).toBe(4);
    });

    it('空数组视为缺席：无法写回 globalSort，但保留默认序号占位', () => {
      const plan = planModuleSort({ campusExperience: [] });
      const byField = Object.fromEntries(plan.map((e) => [e.field, e]));
      expect(byField.campusExperience.present).toBe(false);
      expect(byField.campusExperience.rank).toBe(5);
      expect(byField.campusExperience.conflicted).toBe(false);
    });

    it('标记冲突：非正代表值或与其它在场模块同值', () => {
      const plan = planModuleSort({
        projectExperience: [{ globalSort: 3 }],
        internshipExperience: [{ globalSort: 3 }],
        skills: { content: 'a', globalSort: 0 },
        certificates: { content: 'c', globalSort: 7 },
      });
      const byField = Object.fromEntries(plan.map((e) => [e.field, e]));

      expect(byField.projectExperience.conflicted).toBe(true);
      expect(byField.internshipExperience.conflicted).toBe(true);
      expect(byField.skills.conflicted).toBe(true);
      expect(byField.certificates.conflicted).toBe(false);
    });
  });

  describe('buildModuleSortUpdate', () => {
    it('缺失值（落库补 0）按默认序号补位，数组整组替换、对象写点号路径', () => {
      const update = buildModuleSortUpdate({
        workExperience: [{ name: 'A', globalSort: 2, localSort: 2 }],
        projectExperience: [{ name: 'P', globalSort: 0, localSort: 1 }],
        educationBackground: [{ name: 'E', globalSort: 1, localSort: 1 }],
        skills: { content: 'a,b', globalSort: 0 },
        certificates: { content: 'c', globalSort: 7 },
      });

      expect(update).toEqual({
        educationBackground: [{ name: 'E', globalSort: 1, localSort: 1 }],
        workExperience: [{ name: 'A', globalSort: 2, localSort: 1 }],
        projectExperience: [{ name: 'P', globalSort: 3, localSort: 1 }],
        'skills.globalSort': 6,
        'certificates.globalSort': 7,
      });
    });

    it('全部缺失时按 prompt 默认顺序重编号 1..8', () => {
      const update = buildModuleSortUpdate({
        workExperience: [{ name: 'A', globalSort: 0, localSort: 1 }],
        projectExperience: [{ name: 'P', globalSort: 0, localSort: 1 }],
        educationBackground: [{ name: 'E', globalSort: 0, localSort: 1 }],
        internshipExperience: [{ name: 'I', globalSort: 0, localSort: 1 }],
        campusExperience: [{ name: 'C', globalSort: 0, localSort: 1 }],
        skills: { content: 'a,b', globalSort: 0 },
        certificates: { content: 'c', globalSort: 0 },
        selfEvaluation: { content: 's', globalSort: 0 },
      });

      expect(update.workExperience[0].globalSort).toBe(1);
      expect(update.projectExperience[0].globalSort).toBe(2);
      expect(update.educationBackground[0].globalSort).toBe(3);
      expect(update.internshipExperience[0].globalSort).toBe(4);
      expect(update.campusExperience[0].globalSort).toBe(5);
      expect(update['skills.globalSort']).toBe(6);
      expect(update['certificates.globalSort']).toBe(7);
      expect(update['selfEvaluation.globalSort']).toBe(8);
    });

    it('空数组模块跳过写回，数组内 localSort 按既有相对顺序重编', () => {
      const update = buildModuleSortUpdate({
        workExperience: [
          { name: 'A', globalSort: 5, localSort: 0 },
          { name: 'B', globalSort: 5, localSort: 0 },
        ],
        campusExperience: [],
      });

      expect(update).toEqual({
        workExperience: [
          { name: 'A', globalSort: 4, localSort: 1 },
          { name: 'B', globalSort: 4, localSort: 2 },
        ],
      });
    });

    it('onlyOnConflict：值唯一时不产生任何键（正常换序零副作用）', () => {
      const update = buildModuleSortUpdate(
        {
          workExperience: [{ name: 'A', globalSort: 1, localSort: 1 }],
          educationBackground: [{ name: 'E', globalSort: 2, localSort: 2 }],
          skills: { content: 'a,b', globalSort: 6 },
          certificates: { content: '', globalSort: 7 },
          campusExperience: [],
        },
        { onlyOnConflict: true },
      );

      expect(update).toEqual({});
    });

    it('onlyOnConflict：重复/非正代表值时给出完整修复载荷', () => {
      const update = buildModuleSortUpdate(
        {
          projectExperience: [
            { title: 'P1', globalSort: 3, localSort: 1 },
            { title: 'P2', globalSort: 3, localSort: 2 },
          ],
          internshipExperience: [
            { companyName: 'I1', globalSort: 3, localSort: 1 },
          ],
          educationBackground: [
            { schoolName: 'E1', globalSort: 2, localSort: 1 },
          ],
        },
        { onlyOnConflict: true },
      );

      // education(2) 在 project/internship(3) 之前；同值时按默认序号 project(2) 在 internship(4) 前
      expect(update.projectExperience).toEqual([
        { title: 'P1', globalSort: 3, localSort: 1 },
        { title: 'P2', globalSort: 3, localSort: 2 },
      ]);
      expect(update.internshipExperience).toEqual([
        { companyName: 'I1', globalSort: 4, localSort: 1 },
      ]);
      expect(update.educationBackground).toEqual([
        { schoolName: 'E1', globalSort: 2, localSort: 1 },
      ]);
    });
  });

  describe('applyModuleSortNormalization', () => {
    it('返回文档形态的结果（对象模块整体替换，不产生点号键）', () => {
      const normalized = applyModuleSortNormalization({
        projectExperience: [{ title: 'P1', globalSort: 3, localSort: 1 }],
        internshipExperience: [
          { companyName: 'I1', globalSort: 3, localSort: 1 },
        ],
        skills: { content: 'a,b', globalSort: 0 },
      });

      expect(normalized.skills).toEqual({ content: 'a,b', globalSort: 6 });
      expect(normalized.internshipExperience[0].globalSort).toBe(4);
      expect(Object.keys(normalized).some((key) => key.includes('.'))).toBe(
        false,
      );
    });

    it('onlyOnConflict 且无冲突时原样返回', () => {
      const doc = {
        workExperience: [{ name: 'A', globalSort: 1, localSort: 1 }],
        skills: { content: 'a', globalSort: 6 },
      };

      const normalized = applyModuleSortNormalization(doc, {
        onlyOnConflict: true,
      });
      expect(normalized).toEqual(doc);
    });
  });
});
