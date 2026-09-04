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
    'features/workspace/hooks/useWorkspaceCatalog.ts',
    'features/project/pages/ProjectsPage.tsx',
    'features/project/pages/ProjectDetailPage.tsx',
    'features/project/components/ProjectEditModal.tsx',
    'features/service/pages/ServicesPage.tsx',
    'features/service/pages/ServiceDetailPage.tsx',
    'features/service/components/ServiceEditModal.tsx',
    'features/project-daily-progress/components/DailyProgressPanel.tsx',
    'features/shared/hooks/useMarkdownDocumentViewer.ts',
    'api/workspace.ts',
  ];
  for (const relative of expected) assert.equal(fs.existsSync(path.join(webSource, relative)), true, `missing ${relative}`);

  const retired = [
    'pages/WorkspacesPage.tsx', 'pages/ProjectsPage.tsx', 'pages/ProjectDetailPage.tsx',
    'pages/ProjectEditPage.tsx', 'pages/ProjectsSection.tsx', 'pages/ServicesPage.tsx',
    'pages/ServiceDetailPage.tsx', 'pages/ServiceEditPage.tsx',
    'components/ProjectEditModal.tsx', 'components/ServiceEditModal.tsx',
    'pages/project-detail/DailyProgressPanel.tsx',
  ];
  for (const relative of retired) assert.equal(fs.existsSync(path.join(webSource, relative)), false, `legacy owner remains: ${relative}`);

  const app = source('App.tsx');
  for (const domain of ['workspace', 'project', 'service']) assert.match(app, new RegExp(`features/${domain}/pages/`));
  assert.match(source('features/project/pages/ProjectDetailPage.tsx'), /useMarkdownDocumentViewer/);
  assert.match(source('features/service/pages/ServiceDetailPage.tsx'), /useMarkdownDocumentViewer/);
  assert.match(source('features/project/pages/ProjectDetailPage.tsx'), /project-daily-progress/);
});

test('领域Feature不形成相互反向依赖', () => {
  for (const domain of ['workspace', 'project', 'service']) {
    const root = path.join(webSource, 'features', domain);
    const files: string[] = [];
    const visit = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(file);
        else if (/\.tsx?$/.test(entry.name)) files.push(file);
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
