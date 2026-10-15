import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, App, ConfigProvider, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { PrototypeTab } from '../../features/task/components/PrototypeTab';
import { PrototypeReaderLayout } from '../../features/task/components/PrototypeReaderLayout';
import { prototypeEntries, type UiPrototypeData } from '../../features/task/components/prototype-content';
import { softProductTheme } from '../../theme';
import scenes from './scenes.json';
import 'antd/dist/reset.css';
import '../../styles.css';

declare const __PROTOTYPE_DOCUMENT_GZIP__: string;
declare const __PROTOTYPE_DOCUMENT_BYTES__: number;
declare const __PROTOTYPE_OBSERVED_AT__: string;
function Viewer() {
  const [selectedKey, setSelectedKey] = useState('repository-explorer:files');
  const [revision, setRevision] = useState(0);
  const [documentHtml, setDocumentHtml] = useState<string | null>(null);
  const [decodeError, setDecodeError] = useState('');
  useEffect(() => {
    const bytes = Uint8Array.from(atob(__PROTOTYPE_DOCUMENT_GZIP__), character => character.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    void new Response(stream).text().then(setDocumentHtml).catch(() => setDecodeError('原型读取失败，请直接打开原型正文。'));
  }, []);
  const data = useMemo<UiPrototypeData>(() => ({
    taskId: 'code-workspace-explorer',
    prototypes: [{
      id: 'repository-explorer', source: 'change', project: 'product', change: 'add-code-workspace-explorer', lifecycle: 'active',
      provenance: 'task-worktree-candidate', path: 'openspec/changes/add-code-workspace-explorer/prototypes/repository-explorer.html',
      title: 'Buildr 代码板块与资源管理器', sizeBytes: __PROTOTYPE_DOCUMENT_BYTES__,
      updatedAt: __PROTOTYPE_OBSERVED_AT__ + ':' + revision,
      metadata: { version: 1, pages: scenes.pages },
    }],
    diagnostics: [],
  }), [revision]);
  return <PrototypeReaderLayout entries={prototypeEntries(data)} selectedKey={selectedKey} onSelect={setSelectedKey}>
    {decodeError ? <Alert type="error" message={decodeError} /> : documentHtml === null ? <Spin /> : <PrototypeTab active standalone workspaceId={null} data={data} documentHtml={documentHtml} loading={false} error={null} onRefresh={() => setRevision(value => value + 1)} selectedKey={selectedKey} onSelect={setSelectedKey} />}
  </PrototypeReaderLayout>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{ ...softProductTheme, cssVar: true, hashed: false }} wave={{ disabled: true }}><App><Viewer /></App></ConfigProvider>);
