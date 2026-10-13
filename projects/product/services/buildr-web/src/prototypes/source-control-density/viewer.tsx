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
  const [selectedKey, setSelectedKey] = useState('source-control-density:compact'), [revision, setRevision] = useState(0);
  const [documentHtml, setDocumentHtml] = useState<string|null>(null), [error, setError] = useState('');
  useEffect(() => {
    const bytes = Uint8Array.from(atob(__PROTOTYPE_DOCUMENT_GZIP__), character => character.charCodeAt(0));
    void new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text().then(setDocumentHtml).catch(() => setError('原型解码失败。'));
  }, []);
  const data = useMemo<UiPrototypeData>(() => ({taskId:'source-control-refresh-refinement',diagnostics:[],prototypes:[{
    id:'source-control-density',source:'change',project:'product',change:'refine-code-remote-refresh',lifecycle:'active',provenance:'task-worktree-candidate',path:'prototypes/source-control-density.html',
    title:'源代码管理 · 名称优先布局对照',sizeBytes:__PROTOTYPE_DOCUMENT_BYTES__,updatedAt:__PROTOTYPE_OBSERVED_AT__ + ':' + revision,metadata:{version:1,pages:scenes.pages},
  }]}), [revision]);
  return <PrototypeReaderLayout entries={prototypeEntries(data)} selectedKey={selectedKey} onSelect={setSelectedKey}>
    {error ? <Alert type="error" message={error} /> : documentHtml === null ? <Spin /> : <PrototypeTab active standalone workspaceId={null} data={data} documentHtml={documentHtml} loading={false} error={null} onRefresh={() => setRevision(value => value + 1)} selectedKey={selectedKey} onSelect={setSelectedKey} />}
  </PrototypeReaderLayout>;
}
createRoot(document.getElementById('root')!).render(<ConfigProvider locale={zhCN} theme={{...softProductTheme,cssVar:true,hashed:false}} wave={{disabled:true}}><App><Viewer /></App></ConfigProvider>);
