import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useAppShell } from '../app/AppShellContext';

type WorkspaceData = {
  revision: string;
  rootPath: string;
  schemaVersion: string;
  migrationRequired?: boolean;
  nextActions?: string[];
  workspace: {
    id?: string;
    name: string;
    description: string;
  };
};

export function SettingsPage() {
  const { setWorkspace, setBreadcrumbParts } = useAppShell();
  const [current, setCurrent] = useState<WorkspaceData | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saveState, setSaveState] = useState('正在读取');
  const [migrationMessage, setMigrationMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api('/api/v1/workspace') as WorkspaceData;
        if (cancelled) return;
        setCurrent(data);
        setWorkspace(data);
        setName(data.workspace.name);
        setDescription(data.workspace.description);
        setBreadcrumbParts([data.workspace.name, '工作空间设置']);
        const readOnly = Boolean(data.migrationRequired);
        setSaveState(readOnly ? '迁移前只读' : '已读取真实文件');
        setMigrationMessage(readOnly ? (data.nextActions || []).join(' ') : '');
      } catch (error) {
        if (!cancelled) {
          setSaveState(error instanceof Error ? error.message : '读取失败');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [setWorkspace, setBreadcrumbParts]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!current) return;
    setSaveState('正在保存…');
    try {
      const data = await api('/api/v1/workspace', {
        method: 'PUT',
        body: JSON.stringify({ revision: current.revision, name, description }),
      }) as WorkspaceData;
      setCurrent(data);
      setWorkspace(data);
      setName(data.workspace.name);
      setDescription(data.workspace.description);
      setBreadcrumbParts([data.workspace.name, '工作空间设置']);
      setSaveState('保存成功');
    } catch (error) {
      const code = (error as { code?: string }).code;
      setSaveState(code === 'workspace_revision_conflict' ? '文件已变化，请刷新后重新判断' : (error instanceof Error ? error.message : '保存失败'));
    }
  };

  const readOnly = Boolean(current?.migrationRequired);

  return (
    <>
      <section className="page-header">
        <p className="eyebrow">工作空间</p>
        <h1>工作空间设置</h1>
        <p className="page-copy">只修改稳定元数据；身份、目录和数据格式版本始终保持只读。</p>
      </section>
      <div id="settings-migration" className={`alert${migrationMessage ? '' : ' hidden'}`} role="status">
        {migrationMessage}
      </div>
      <section className="content-grid settings-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">基本信息</p>
              <h2>名称与说明</h2>
            </div>
            <span id="workspace-save-state" className="state">{saveState}</span>
          </div>
          <form id="workspace-form" onSubmit={(event) => void onSubmit(event)}>
            <label>
              名称
              <input
                id="workspace-name"
                name="name"
                autoComplete="off"
                required
                disabled={!current || readOnly}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              说明
              <textarea
                id="workspace-description-input"
                name="description"
                rows={7}
                required
                disabled={!current || readOnly}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <div className="actions">
              <button id="workspace-save-button" className="button primary" type="submit" disabled={!current || readOnly}>
                保存修改
              </button>
            </div>
          </form>
        </article>
        <aside className="panel facts-panel">
          <p className="eyebrow">技术事实</p>
          <h2>只读事实</h2>
          <dl className="fact-list">
            <div>
              <dt>工作空间 ID</dt>
              <dd id="workspace-id">{current?.workspace.id || '迁移后生成'}</dd>
            </div>
            <div>
              <dt>本地目录</dt>
              <dd id="workspace-root">{current?.rootPath || '—'}</dd>
            </div>
            <div>
              <dt>数据格式版本</dt>
              <dd id="workspace-schema">{current?.schemaVersion || '—'}</dd>
            </div>
            <div>
              <dt>修订版本</dt>
              <dd id="workspace-revision">{current?.revision || '—'}</dd>
            </div>
          </dl>
        </aside>
      </section>
    </>
  );
}
