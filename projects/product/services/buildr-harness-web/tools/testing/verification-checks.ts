import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
export const serviceVerificationChecks = [
 {id:'harness-shell-composition',type:'Integration',name:'Optional work environment composition and stable conversation DOM',sourcePaths:['src/shell/**','src/shell.ts','src/HarnessApp.tsx','src/index.ts','src/styles.css'],testFiles:['test/shell/*.test.ts'],command:{file:process.execPath,args:['--test','test/shell/*.test.ts'],cwd:'.'},requirements:['Playwright Chromium; browser component fixture only, not real Development or model acceptance.'],timeoutMs:90000},
 {id:'harness-web-product-boundaries',type:'Static',name:'Complete webpage and frame ownership boundaries',sourcePaths:['src/**','services/buildr-web/src/**'],testFiles:['test/ui/static/*.test.mjs'],command:{file:process.execPath,args:['--test','test/ui/static/*.test.mjs'],cwd:'.'}},
 {id:'harness-web-logic',type:'Unit',name:'Complete Harness conversation behavior',sourcePaths:['src/**'],testFiles:['test/ui/*.test.mjs'],command:{file:process.execPath,args:[path.join(root,'tools/ui/run-logic-tests.mjs')],cwd:'.'}},
  {
    id: 'harness-standalone-browser', type: 'E2E', name: 'Standalone production UI and real source HTTP with isolated executor fixture',
    sourcePaths: ['src/**', 'services/buildr-harness-web/**', 'services/buildr-harness/**'],
    behaviorOnlyInputs: ['services/buildr-harness-web/**', 'services/buildr-harness/**'],
    testFiles: ['test/browser/*.test.ts'],
    command: {file: process.execPath, args: ['--test', 'test/browser/*.test.ts'], cwd: '.'},
    requirements: ['Prepared core package with current standalone production assets and Playwright Chromium; no real model/account acceptance is implied.'],
    timeoutMs: 150000,
  },
  {
    id: 'harness-web-build', type: 'Static', name: 'Standalone Harness production shell and shared UI build',
    sourcePaths: ['src/**', 'index.html', 'mermaid-renderer.html', 'vite.config.ts', 'package.json', 'tsconfig.json', 'services/buildr-harness-web/**'],
    command: {file: process.execPath, args: [path.join(root, 'tools/build.ts')], cwd: '.'},
    requirements: ['Uses the formal Vite build; this does not claim browser or model execution acceptance.'],
  },
  {
    id: 'harness-web-boundaries', type: 'Static', name: 'Standalone shell dependency and delivery boundaries',
    sourcePaths: ['src/**', 'package.json', 'vite.config.ts', 'LICENSE'], testFiles: ['test/*.test.ts'],
    command: {file: process.execPath, args: ['--test', 'test/*.test.ts'], cwd: '.'},
  },
] as const;
