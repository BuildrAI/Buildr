import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

// Browser preparation is explicit; executing tests never installs a browser.
export async function launchTestBrowser() {
  const configured = process.env.BUILDR_BROWSER_EXECUTABLE;
  let executablePath: string | undefined;
  if (configured !== undefined) {
    if (!configured.trim()) throw new Error('BUILDR_BROWSER_EXECUTABLE 不能为空；取消设置后使用 Playwright 配套 Chromium。');
    executablePath = path.resolve(configured);
    try {
      fs.accessSync(executablePath, fs.constants.X_OK);
      if (!fs.statSync(executablePath).isFile()) throw new Error('not a file');
    } catch (cause) {
      throw new Error(`BUILDR_BROWSER_EXECUTABLE 不是可执行文件：${executablePath}；修正路径或取消设置，不会自动改用其他浏览器。`, { cause });
    }
  }

  try {
    const browser = await chromium.launch({ headless: true, executablePath });
    process.stderr.write(`[buildr-browser] browser=${browser.version()} source=${executablePath ?? 'playwright-chromium'} headless=true\n`);
    return browser;
  } catch (cause) {
    if (!executablePath && cause instanceof Error && cause.message.includes("Executable doesn't exist")) {
      throw new Error('缺少当前 Playwright 版本配套的 Chromium。请在 buildr 服务目录运行 tools/development/run-development-npm run test:browser:install；测试不会自动下载，也不需要 Tabbit 或 Codex 内置浏览器。', { cause });
    }
    throw cause;
  }
}
