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
  const [selectedKey, setSelectedKey] = useState('workspace-onboarding-update:workspaces');
  const [revision, setRevision] = useState(0);
  const [resetStateToken,setResetStateToken] = useState(0);
  const [documentHtml, setDocumentHtml] = useState<string | null>(null);
  const [decodeError, setDecodeError] = useState('');

  useEffect(() => {
    const bytes = Uint8Array.from(atob(__PROTOTYPE_DOCUMENT_GZIP__), character => character.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    void new Response(stream).text().then(setDocumentHtml).catch(() => setDecodeError('原型（Prototype）读取失败，请直接打开原型正文。'));
  }, []);

  const data = useMemo<UiPrototypeData>(() => ({
    taskId: '',
    prototypes: [{
      id: 'workspace-onboarding-update',
      source: 'task',
      project: null,
      change: null,
      lifecycle: null,
      provenance: 'task-local',
      path: 'workspace-onboarding-update.html',
      title: 'Buildr 添加与更新 · 交互原型',
      sizeBytes: __PROTOTYPE_DOCUMENT_BYTES__,
      updatedAt: __PROTOTYPE_OBSERVED_AT__ + ':' + revision,
      metadata: { version: 1, pages: scenes.pages },
    }],
    diagnostics: [],
  }), [revision]);

  return <PrototypeReaderLayout entries={prototypeEntries(data)} selectedKey={selectedKey} onSelect={key=>{setSelectedKey(key);setResetStateToken(value=>value+1);}}>
    {decodeError ? <Alert type="error" message={decodeError} /> : documentHtml === null ? <Spin /> :
      <PrototypeTab active standalone workspaceId={null} data={data} documentHtml={documentHtml} loading={false} error={null}
        sourceLabel="临时评审原型" resetStateToken={resetStateToken} onRefresh={() => setRevision(value => value + 1)} selectedKey={selectedKey} onSelect={setSelectedKey} />}
  </PrototypeReaderLayout>;
}

createRoot(document.getElementById('root')!).render(
  <ConfigProvider locale={zhCN} theme={{ ...softProductTheme, cssVar: true, hashed: false }} wave={{ disabled: true }}>
    <App><Viewer /></App>
  </ConfigProvider>,
);
