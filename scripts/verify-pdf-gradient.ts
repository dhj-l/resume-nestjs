/**
 * 简历导出 PDF 渐变背景验证脚本
 *
 * 背景：后端曾向导出页注入 @tailwindcss/browser@4 运行时，其注册的
 *   @property --tw-gradient-from/to { syntax: "<color>" } 会把前端
 *   Tailwind 3 的渐变变量声明（颜色 + 位置两个 token）判为非法并静默
 *   回退成透明色，导致导出 PDF 的渐变背景消失。修复为不注入运行时。
 *
 * 本脚本复刻前端 dist 产物的真实渐变 CSS（含空值位置变量），走与
 * ResumeService.downloadResume 相同的 setContent → pdf 流程，验证：
 *   1. 修复后：计算样式中渐变颜色保留（rgb(79, 70, 229) → #4f46e5）
 *   2. 对照（可选）：注入旧运行时后渐变回退为透明（复现 bug）
 *   3. 生成 PDF 并检查其中的渐变对象（/Shading）
 *
 * 使用：
 *   npx ts-node --project tsconfig.scripts.json scripts/verify-pdf-gradient.ts
 *
 * 对照用例（复现旧 bug）：先把删除前的运行时导出到临时目录再运行：
 *   git show HEAD:src/assets/tailwind.browser.js > "%TEMP%/tailwind.browser.js"
 *   LEGACY_TAILWIND_JS="%TEMP%/tailwind.browser.js" npx ts-node ...
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import puppeteer, { Browser } from 'puppeteer';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

/** 前端 dist 产物中的真实渐变规则（esbuild 压缩文本，含空值位置变量） */
const SAMPLE_CSS = `
*,:before,:after{--tw-gradient-from: #0000;--tw-gradient-to: #0000;--tw-gradient-stops: ;--tw-gradient-from-position: ;--tw-gradient-via-position: ;--tw-gradient-to-position: ;box-sizing:border-box;border-width:0;border-style:solid}
.bg-gradient-to-r{background-image:linear-gradient(to right,var(--tw-gradient-stops))}
.from-indigo-600{--tw-gradient-from: #4f46e5 var(--tw-gradient-from-position);--tw-gradient-to: rgb(79 70 229 / 0) var(--tw-gradient-to-position);--tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to)}
.to-indigo-700{--tw-gradient-to: #4338ca var(--tw-gradient-to-position)}
.hero{padding:48px;color:#fff;font-size:24px}
`;

const SAMPLE_HTML = `
<div class="hero bg-gradient-to-r from-indigo-600 to-indigo-700">张三的简历</div>
<div class="hero">正文内容，应为白底黑字</div>
`;

/** 与 ResumeService.getBrowser 保持一致的 Chrome 路径解析 */
function resolveExecutablePath(): string | undefined {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const candidates: string[] = [];
  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    );
  } else {
    candidates.push(
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
    );
  }
  return candidates.find((c) => fs.existsSync(c));
}

function buildContent(html: string, css: string, legacyScript?: string) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        ${legacyScript ? `<script>${legacyScript}</script>` : ''}
        <style>
          html, body { margin: 0; padding: 0; background-color: white; }
          ${css}
        </style>
      </head>
      <body>${html}</body>
    </html>
  `;
}

async function runCase(
  browser: Browser,
  label: string,
  legacyScript?: string,
) {
  const page = await browser.newPage();
  try {
    const content = buildContent(SAMPLE_HTML, SAMPLE_CSS, legacyScript);
    await page.setContent(content, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.readyState === 'complete');

    const backgroundImage = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('.bg-gradient-to-r');
      return el ? getComputedStyle(el).backgroundImage : '(元素未找到)';
    });
    const hasRealColor =
      backgroundImage.includes('rgb(79, 70, 229)') &&
      backgroundImage.includes('rgb(67, 56, 202)');
    const fellBackToTransparent =
      backgroundImage.includes('rgba(0, 0, 0, 0)') ||
      backgroundImage.includes('#0000');

    console.log(`\n[${label}]`);
    console.log(`  backgroundImage: ${backgroundImage}`);
    console.log(`  渐变色保留: ${hasRealColor ? '✓ 是' : '✗ 否'}`);
    console.log(`  回退透明色: ${fellBackToTransparent ? '✗ 是（bug）' : '✓ 否'}`);

    const outPath = path.join(
      os.tmpdir(),
      `verify-pdf-gradient-${label}.pdf`,
    );
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });
    fs.writeFileSync(outPath, pdfBuffer);
    const shadingCount = (
      Buffer.from(pdfBuffer).toString('latin1').match(/\/Shading/g) || []
    ).length;
    console.log(`  PDF: ${outPath}（含渐变对象 /Shading × ${shadingCount}）`);

    const shotPath = path.join(os.tmpdir(), `verify-pdf-gradient-${label}.png`);
    await page.screenshot({ path: shotPath, fullPage: true });
    console.log(`  截图: ${shotPath}`);

    return { hasRealColor, fellBackToTransparent };
  } finally {
    await page.close();
  }
}

async function main() {
  console.log('启动 Puppeteer…');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    ...(resolveExecutablePath()
      ? { executablePath: resolveExecutablePath() }
      : {}),
  });

  try {
    // 用例 A：修复后行为（无运行时注入）
    const fixed = await runCase(browser, 'fixed-无运行时');

    // 用例 B（可选）：注入旧运行时复现 bug
    const legacyPath = process.env.LEGACY_TAILWIND_JS;
    if (legacyPath && fs.existsSync(legacyPath)) {
      const legacyScript = fs.readFileSync(legacyPath, 'utf-8');
      await runCase(browser, 'legacy-注入v4运行时', legacyScript);
    } else {
      console.log(
        '\n（跳过旧 bug 对照用例：未设置 LEGACY_TAILWIND_JS 环境变量）',
      );
    }

    if (!fixed.hasRealColor) {
      console.error('\n✗ 验证失败：修复后渐变色仍未保留');
      process.exitCode = 1;
    } else {
      console.log('\n✓ 验证通过：修复后渐变背景正常渲染');
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('验证脚本执行失败:', err);
  process.exitCode = 1;
});
