import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const webSource = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../buildr-web/src');

function source(relative: string) {
  return fs.readFileSync(path.join(webSource, relative), 'utf8');
}

test('Workspace、Project与Service前端保持独立Feature并共享唯一Workspace Client', () => {
  const expected = [
    'features/workspace/pages/WorkspacesPage.tsx',
    'features/project/pages/ProjectsPage.tsx',
    'features/project/pages/ProjectDetailPage.tsx',
    'features/workspace/components/AssetEditDrawer.tsx',
    'features/service/pages/ServicesPage.tsx',
    'features/service/pages/ServiceDetailPage.tsx',
    'features/workspace/components/ServiceCreateDrawer.tsx',
    'features/workspace/components/ProjectServiceSelection.tsx',
    'lib/useMarkdownDocumentViewer.ts',
    'features/workspace/api/workspace-api.ts',
    'features/project/api/project-api.ts',
    'features/service/api/service-api.ts',
  ];
  for (const relative of expected) assert.equal(fs.existsSync(path.join(webSource, relative)), true, `missing ${relative}`);

  const retired = [
    'pages/WorkspacesPage.tsx', 'pages/ProjectsPage.tsx', 'pages/ProjectDetailPage.tsx',
    'pages/ProjectEditPage.tsx', 'pages/ProjectsSection.tsx', 'pages/ServicesPage.tsx',
    'pages/ServiceDetailPage.tsx', 'pages/ServiceEditPage.tsx',
    'components/ProjectEditModal.tsx', 'components/ServiceEditModal.tsx',
    'features/service/components/ServiceEditDrawer.tsx',
    'features/service/components/ServiceCreateDrawer.tsx',
    'features/service/components/service-create-draft.ts',
    'features/project/components/ProjectServiceSelection.tsx',
  ];
  for (const relative of retired) assert.equal(fs.existsSync(path.join(webSource, relative)), false, `legacy owner remains: ${relative}`);

  const app = source('App.tsx');
  assert.match(app, /import\s*\{\s*CurrentWorkspaceRoute\s*\}\s*from\s*['"]\.\/app\/workspace-routes['"]/);
  assert.match(app, /path:\s*['"]\/workspaces\/:workspaceId\/\*['"][\s\S]*?children:\s*\[[\s\S]*?element:\s*<CurrentWorkspaceRoute\s*\/>/);
  const routes = source('app/workspace-routes.tsx');
  for (const domain of ['workspace', 'project', 'service']) assert.match(routes, new RegExp(`features/${domain}/pages/`));
  assert.match(routes, /function CurrentWorkspaceRoute\(\)[\s\S]*?return useRoutes\(workspaceRoutes\)/);
  assert.match(routes, /function RetainedWorkspaceRoute\([\s\S]*?return useRoutes\(workspaceRoutes, location\)/);
  assert.match(source('features/project/pages/ProjectDetailPage.tsx'), /useMarkdownDocumentViewer/);
  assert.match(source('features/workspace/components/AssetHome.tsx'), /ResourceDocumentPane/);
  assert.doesNotMatch(source('features/service/pages/ServiceDetailPage.tsx'), /MarkdownHost|renderMarkdown/);
});

test('领域Feature不形成相互反向依赖', () => {
  for (const domain of ['workspace', 'project', 'service']) {
    const root = path.join(webSource, 'features', domain);
    const files: string[] = [];
    const visit = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(file);
        else if (/\.tsx?$/.test(entry.name) && !file.includes('/api/')) files.push(file);
      }
    };
    visit(root);
    const combined = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    assert.doesNotMatch(combined, /\bapi\s*\(/, `${domain} must use the shared workspaceApi client`);
    for (const other of ['workspace', 'project', 'service'].filter((candidate) => candidate !== domain)) {
      assert.doesNotMatch(combined, new RegExp(`features/${other}/`), `${domain} must not import ${other}`);
    }
  }
});

test('Task Feature复用Workspace Client与公共API类型', () => {
  const taskFiles = [
    'features/task/hooks/useTaskList.ts',
    'features/task/hooks/useTaskDetail.ts',
    'features/task/hooks/useTaskArtifacts.ts',
    'features/task/hooks/useTaskEvidence.ts',
    'features/task/hooks/useTaskActions.ts',
  ];
  const combined = taskFiles.map(source).join('\n');
  assert.doesNotMatch(combined, /\bapi\s*\(/);
  assert.match(combined, /workspaceApi\.read/);
  assert.match(combined, /projectApi\.listProjects/);
  assert.match(combined, /serviceApi\.services/);
  assert.match(combined, /taskApi\.projectDocument/);
  assert.doesNotMatch(combined, /type ApiFailure|type WorkspacePayload|type ProjectDocument/);
});

function extractStringLiterals(content: string): Array<{ value: string; line: number }> {
  const literals: Array<{ value: string; line: number }> = [];
  let index = 0;
  let line = 1;
  while (index < content.length) {
    const ch = content[index]!;
    const next = content[index + 1];
    if (ch === '\n') { line++; index++; continue; }
    if (ch === '/' && next === '/') {
      index += 2;
      while (index < content.length && content[index] !== '\n') index++;
      continue;
    }
    if (ch === '/' && next === '*') {
      index += 2;
      while (index < content.length && !(content[index] === '*' && content[index + 1] === '/')) {
        if (content[index] === '\n') line++;
        index++;
      }
      index += 2;
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      const quote = ch;
      const startLine = line;
      index++;
      let value = '';
      let hasInterpolation = false;
      while (index < content.length && content[index] !== quote) {
        if (content[index] === '\\') {
          if (content[index + 1] === '\n') line++;
          value += content[index + 1] ?? '';
          index += 2;
          continue;
        }
        if (quote === '`' && content[index] === '$' && content[index + 1] === '{') {
          hasInterpolation = true;
          index += 2;
          let depth = 1;
          while (index < content.length && depth > 0) {
            if (content[index] === '\n') line++;
            else if (content[index] === '{') depth++;
            else if (content[index] === '}') depth--;
            index++;
          }
          continue;
        }
        if (content[index] === '\n') line++;
        value += content[index]!;
        index++;
      }
      index++;
      if (!hasInterpolation) literals.push({ value, line: startLine });
      continue;
    }
    index++;
  }
  return literals;
}

test('Buildr Web 对话与公共模型库不出现执行方品牌字面量分支（历史名称兜底表除外）', () => {
  const forbidden = new Set([
    'codex',
    'dsh',
    'qoder',
    'qoder-cn',
    'claude-code',
    'antigravity',
    'native-codex',
    'native-dsh',
    'native-qoder',
    'native-qoder-cn',
    'native-claude-code',
    'native-antigravity',
  ]);
  const allowedHistoricalFallbackFiles = new Set(['lib/model-picker.ts']);
  const roots = ['features/agent-conversations', 'lib'];
  const scanned: string[] = [];
  const violations: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (/\.tsx?$/.test(entry.name)) {
        const relative = path.relative(webSource, fullPath).split(path.sep).join('/');
        scanned.push(relative);
        if (allowedHistoricalFallbackFiles.has(relative)) continue;
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const literal of extractStringLiterals(content)) {
          if (forbidden.has(literal.value)) {
            violations.push(`${relative}:${literal.line} -> '${literal.value}'`);
          }
        }
      }
    }
  };
  for (const dir of roots) visit(path.join(webSource, dir));
  assert.ok(scanned.length >= 25, 'expected agent-conversations and lib TypeScript files to be scanned');
  assert.deepEqual(
    violations,
    [],
    'buildr-web agent-conversations and lib must rely on server-declared presentation, compatibility, and nativeDetail metadata',
  );
});
