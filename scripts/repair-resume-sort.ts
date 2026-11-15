/**
 * 简历模块排序字段（globalSort）存量修复脚本
 *
 * 背景：AI 落库路径（智能导入 `POST /resume-ai/parse`、legacy 同步生成
 * `/resume-ai/generate`）曾把 AI 输出的重复/缺失 globalSort 原样写库
 * （例如 projectExperience 与 internshipExperience 都是 3），导致前端
 * "交换式排序"对相等值是空操作、模块无法排序。
 *
 * 本脚本扫描全库非模板简历，仅对存在"重复或非正 globalSort"的文档按模块
 * 相对顺序重编为唯一值（1..n），内容与模块顺序均不改动。
 *
 * 使用：
 *   pnpm repair:resume-sort                # 实际修复
 *   pnpm repair:resume-sort -- --dry-run   # 只预览，不写库
 *
 * 环境变量（读取项目根 .env）：MONGODB_URI
 * 幂等：修复后再次执行应输出"已修复 0 份"。
 */

import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as path from 'path';
import {
  SORTABLE_MODULE_SORT,
  applyModuleSortNormalization,
  buildModuleSortUpdate,
} from '../src/resume/utils/module-sort.util';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/resume-nestjs';
const DRY_RUN = process.argv.includes('--dry-run');

/** 输出各模块当前排序值（数组取首项，空数组显示为 []） */
const summarize = (doc: Record<string, any>): string =>
  SORTABLE_MODULE_SORT.map(([field]) => {
    const value = doc?.[field];
    if (Array.isArray(value)) {
      return `${field}=${value.length ? value[0]?.globalSort : '[]'}`;
    }
    if (value && typeof value === 'object') {
      return `${field}=${value.globalSort}`;
    }
    return `${field}=-`;
  }).join(' ');

async function main(): Promise<void> {
  console.log(`连接数据库: ${MONGODB_URI}`);
  await mongoose.connect(MONGODB_URI);
  const collection = mongoose.connection.collection('resumes');

  let scanned = 0;
  let repaired = 0;

  for await (const doc of collection.find({ isTemplate: { $ne: true } })) {
    scanned += 1;

    const update = buildModuleSortUpdate(doc, { onlyOnConflict: true });
    if (!Object.keys(update).length) continue;

    repaired += 1;
    console.log(`\n${DRY_RUN ? '[dry-run] ' : ''}${doc._id} ${doc.title ?? ''}`);
    console.log(`  before: ${summarize(doc)}`);
    console.log(
      `  after : ${summarize(
        applyModuleSortNormalization(doc, { onlyOnConflict: true }),
      )}`,
    );

    if (!DRY_RUN) {
      await collection.updateOne({ _id: doc._id }, { $set: update });
    }
  }

  console.log(
    `\n扫描 ${scanned} 份非模板简历，${
      DRY_RUN ? '待修复' : '已修复'
    } ${repaired} 份`,
  );
  if (DRY_RUN) {
    console.log('（dry-run 模式，未写入数据库）');
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('❌ 修复失败:', error?.message ?? error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
