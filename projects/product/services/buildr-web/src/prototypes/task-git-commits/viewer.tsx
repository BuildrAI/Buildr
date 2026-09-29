import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { App, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { PrototypeTab } from '../../features/task/components/PrototypeTab';
import { PrototypeReaderLayout } from '../../features/task/components/PrototypeReaderLayout';
import { prototypeEntries, type UiPrototypeData } from '../../features/task/components/prototype-content';
import { softProductTheme } from '../../theme';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '../../styles.css';

declare const __PROTOTYPE_DOCUMENT__: string;
declare const __PROTOTYPE_OBSERVED_AT__: string;
const prototypeDocument = __PROTOTYPE_DOCUMENT__;

/** Offline data adapter; the existing product reader owns all reading interactions. */
function Viewer() {
  const [selectedKey, setSelectedKey] = useState('task-git-commits:commits');
  const [revision, setRevision] = useState(0);
  const data = useMemo<UiPrototypeData>(() => ({
    taskId: '2026-09-27-task-git-commits',
    prototypes: [{ id: 'task-git-commits', source: 'change', project: 'product', change: 'add-task-git-commit-links', lifecycle: 'active', provenance: 'task-worktree-candidate', path: 'ui-prototype/task-git-commits.html', title: '任务与 Git 提交双向关联', sizeBytes: new Blob([prototypeDocument]).size, updatedAt: `${__PROTOTYPE_OBSERVED_AT__}:${revision}`, metadata: { version: 1, pages: scenes.pages } }],
    diagnostics: [],
  }), [revision]);
  const entries = prototypeEntries(data);
  return <PrototypeReaderLayout entries={entries} selectedKey={selectedKey} onSelect={setSelectedKey}>
    <PrototypeTab active standalone workspaceId={null} data={data} documentHtml={prototypeDocument} loading={false} error={null} onRefresh={() => setRevision(value => value + 1)} selectedKey={selectedKey} onSelect={setSelectedKey} />
  </PrototypeReaderLayout>;
}

createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{ ...softProductTheme, cssVar: true, hashed: false }} wave={{ disabled: true }}><App><Viewer /></App></ConfigProvider>);
