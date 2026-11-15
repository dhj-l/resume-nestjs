/**
 * 构建产物入口校验
 *
 * 从 package.json 的 start:prod 命令里解析出真正的入口文件，断言它存在。
 * 这样「start:prod 指向的文件」与「nest build 实际产出的文件」再也不会漂移
 * ——本仓库曾出现 tsconfig.build.json 未限制 include，把 scripts/ 一起编译，
 * 导致公共根目录上抬、产物变成 dist/src/main.js，而所有启动命令仍指向
 * dist/main.js，四条部署路径全部 MODULE_NOT_FOUND。
 *
 * 用法：pnpm verify:build  （= pnpm build && 本脚本）
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const projectRoot = resolve(__dirname, '..');
const pkgPath = join(projectRoot, 'package.json');

function fail(message: string): never {
  console.error(`\n❌ 构建产物校验失败：${message}\n`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
  scripts?: Record<string, string>;
};

const startProd = pkg.scripts?.['start:prod'];
if (!startProd) {
  fail('package.json 中缺少 scripts.start:prod');
}

// 形如 "node dist/main" / "node dist/main.js" → 取含 dist 的那个 token
const match = startProd.match(/(?:^|\s)([\w./-]*dist[\w./-]*)/);
if (!match) {
  fail(`无法从 start:prod 命令中解析出入口文件：${startProd}`);
}

const entry = match[1].replace(/^\.\//, '');
const entryFile = entry.endsWith('.js') ? entry : `${entry}.js`;
const entryAbs = join(projectRoot, entryFile);

const distDir = join(projectRoot, 'dist');
const describeDist = (): string => {
  if (!existsSync(distDir)) return '  （dist/ 不存在，说明 pnpm build 没有成功执行）';
  const walk = (dir: string, prefix = ''): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      return item.isDirectory()
        ? walk(join(dir, item.name), rel)
        : [join('dist', rel).replace(/\\/g, '/')];
    });
  const files = walk(distDir).filter((f) => f.endsWith('.js'));
  return `  dist/ 下的 .js 入口候选：\n${files.map((f) => `    - ${f}`).join('\n')}`;
};

if (!existsSync(entryAbs)) {
  fail(
    `start:prod 会执行 "node ${entry}"，但 ${entryFile} 并不存在。\n` +
      `  这会让 pnpm start:prod / Docker CMD / PM2 / Railway 全部启动即崩溃。\n` +
      `${describeDist()}\n` +
      `  修复：在 tsconfig.build.json 里加 "include": ["src/**/*.ts"]，` +
      `或把 start:prod 等启动命令统一改为实际产物路径。`,
  );
}

console.log(`✅ 构建产物校验通过：start:prod 指向的 ${entryFile} 存在`);
