import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, App, Button, Form, Input, Skeleton } from 'antd';
import { FolderOutlined } from '@ant-design/icons';
import { DrawerShell } from '../../../components/DrawerShell';
import { workspaceApi, type WorkspaceResponse } from '../api/workspace-api';
import '../workspace-settings.css';

type Props = {
  open: boolean;
  workspaceId: string | null;
  onClose: () => void;
  onSaved: (workspaceId: string, data: WorkspaceResponse) => void;
};
type Draft = { base: WorkspaceResponse; name: string; description: string };

export function WorkspaceSettingsDrawer({ open, workspaceId, onClose, onSaved }: Props) {
  const { message } = App.useApp();
  const drafts = useRef(new Map<string, Draft>());
  const requestScope = useRef({ workspaceId, open });
  if (requestScope.current.workspaceId !== workspaceId || requestScope.current.open !== open) {
    requestScope.current = { workspaceId, open };
  }
  const [current, setCurrent] = useState<WorkspaceResponse | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<WorkspaceResponse | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => () => { requestScope.current = { ...requestScope.current }; }, []);

  useEffect(() => {
    if (!open || !workspaceId) return;
    const controller = new AbortController();
    const scope = requestScope.current;
    setLoading(true);
    setCurrent(null);
    setLoadError('');
    setSaveError('');
    setConflict(false);
    setLatest(null);
    setSaving(false);
    void workspaceApi.readById(workspaceId, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted || requestScope.current !== scope) return;
      const draft = drafts.current.get(workspaceId);
      setCurrent(draft?.base || data);
      setName(draft?.name ?? data.workspace.name);
      setDescription(draft?.description ?? data.workspace.description ?? '');
      if (draft && draft.base.revision !== data.revision) {
        setConflict(true);
        setLatest(data);
      }
    }).catch((error: Error) => {
      if (!controller.signal.aborted && requestScope.current === scope) setLoadError(error.message || '无法读取工作空间。');
    }).finally(() => {
      if (!controller.signal.aborted && requestScope.current === scope) setLoading(false);
    });
    return () => controller.abort();
  }, [open, workspaceId, retry]);

  const changed = Boolean(current && (name !== current.workspace.name || description !== (current.workspace.description || '')));
  const readOnly = Boolean(current?.migrationRequired || latest?.migrationRequired);
  const close = (discard: boolean) => {
    if (saving) return;
    if (workspaceId) {
      if (!discard && current && changed) drafts.current.set(workspaceId, { base: current, name, description });
      else drafts.current.delete(workspaceId);
    }
    onClose();
  };
  const readLatest = async () => {
    if (!workspaceId) return;
    const scope = requestScope.current;
    try {
      const data = await workspaceApi.readById(workspaceId);
      if (requestScope.current !== scope || !scope.open) return;
      setLatest(data);
      setSaveError('');
    } catch (error) {
      if (requestScope.current !== scope || !scope.open) return;
      setSaveError(error instanceof Error ? error.message : '最新内容读取失败，请重试。');
    }
  };
  const save = async (base: WorkspaceResponse | null) => {
    if (!workspaceId || !base?.revision || saving || readOnly || !name.trim() || !description.trim()) return;
    const scope = requestScope.current;
    setSaving(true);
    setSaveError('');
    try {
      const data = await workspaceApi.updateById(workspaceId, { revision: base.revision, name: name.trim(), description: description.trim() });
      onSaved(workspaceId, data);
      if (requestScope.current !== scope || !scope.open) return;
      drafts.current.delete(workspaceId);
      setCurrent(data);
      setName(data.workspace.name);
      setDescription(data.workspace.description || '');
      setConflict(false);
      setLatest(null);
      void message.success('工作空间信息已更新');
      onClose();
    } catch (error) {
      if (requestScope.current !== scope || !scope.open) return;
      if ((error as { code?: string }).code === 'workspace_revision_conflict') {
        setConflict(true);
        setLatest(null);
        await readLatest();
      } else {
        setSaveError(error instanceof Error ? error.message : '保存失败，请重试。');
      }
    } finally {
      if (requestScope.current === scope && scope.open) setSaving(false);
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!conflict) void save(current);
  };
  const useLatest = () => {
    if (!latest) return;
    setCurrent(latest);
    setName(latest.workspace.name);
    setDescription(latest.workspace.description || '');
    setLatest(null);
    setConflict(false);
    setSaveError('');
    if (workspaceId) drafts.current.delete(workspaceId);
  };
  const editable = Boolean(current?.revision && !readOnly && !loading && !loadError);
  const migration = latest?.migrationRequired ? latest : current;
  const updateDraft = (nextName: string, nextDescription: string) => {
    setName(nextName);
    setDescription(nextDescription);
    if (!current || !workspaceId) return;
    if (nextName === current.workspace.name && nextDescription === (current.workspace.description || '')) drafts.current.delete(workspaceId);
    else drafts.current.set(workspaceId, { base: current, name: nextName, description: nextDescription });
  };

  return (
    <DrawerShell
      id="workspace-settings-drawer" rootClassName="workspace-settings-drawer"
      open={open} width="min(520px, 100vw)" title="工作空间设置"
      titleId="workspace-settings-title" sub={current?.workspace.name}
      onClose={() => close(false)} closeAriaLabel="关闭工作空间设置"
      closeDisabled={saving} maskClosable={!saving} keyboard={!saving}
      footer={(
        <div className="workspace-settings-actions">
          <span id="workspace-save-state" role="status">{saving ? '正在保存…' : changed ? '有未保存的修改' : ''}</span>
          <Button onClick={() => close(true)} disabled={saving}>取消</Button>
          <Button id="workspace-save-button" type="primary" htmlType="submit" form="workspace-form"
            loading={saving} disabled={!editable || !changed || conflict || saving || !name.trim() || !description.trim()}>保存修改</Button>
        </div>
      )}
    >
      {loading ? <Skeleton active paragraph={{ rows: 5 }} /> : loadError ? (
        <Alert type="error" showIcon message="工作空间暂时无法读取" description={loadError}
          action={<Button size="small" onClick={() => setRetry(value => value + 1)}>重试</Button>} />
      ) : current ? (
        <>
          <div className="workspace-settings-marker"><FolderOutlined /><strong>{current.workspace.name}</strong></div>
          {readOnly ? <Alert id="settings-migration" type="warning" showIcon message="工作空间需要先完成迁移，当前只读"
            description={(migration?.nextActions || []).join(' ')} /> : null}
          {!current.revision && !readOnly ? <Alert type="warning" showIcon message="暂时无法取得最新内容，请重新读取后再修改。"
            action={<Button size="small" onClick={() => setRetry(value => value + 1)}>重新读取</Button>} /> : null}
          {conflict ? (
            <Alert id="workspace-settings-conflict" type="warning" showIcon message="工作空间已被其他操作修改，当前输入已保留"
              description={(
                <div className="workspace-settings-conflict">
                  {latest ? <>
                    <p>请核对当前文件内容，再决定保留哪些修改。</p>
                    <dl><dt>名称</dt><dd>{latest.workspace.name}</dd><dt>说明</dt><dd>{latest.workspace.description || '尚未填写'}</dd></dl>
                    <div className="workspace-settings-conflict-actions">
                      <Button size="small" onClick={useLatest} disabled={saving}>使用当前文件内容</Button>
                      <Button id="workspace-save-latest" size="small" onClick={() => void save(latest)}
                        disabled={saving || readOnly || !latest.revision || !name.trim() || !description.trim()}>保留输入并按最新版本保存</Button>
                    </div>
                  </> : <Button size="small" onClick={() => void readLatest()} disabled={saving}>读取最新内容</Button>}
                </div>
              )} />
          ) : null}
          {saveError ? <Alert type="error" showIcon message={saveError} /> : null}
          <form id="workspace-form" onSubmit={submit}>
            <Form layout="vertical" component={false}>
              <Form.Item label="名称" htmlFor="workspace-name" required>
                <Input id="workspace-name" name="name" autoComplete="off" required
                  disabled={!editable || saving} value={name} onChange={event => updateDraft(event.target.value, description)} />
              </Form.Item>
              <Form.Item label="说明" htmlFor="workspace-description-input" required>
                <Input.TextArea id="workspace-description-input" name="description" required rows={5}
                  placeholder="这个工作空间用于什么工作？" disabled={!editable || saving}
                  value={description} onChange={event => updateDraft(name, event.target.value)} />
              </Form.Item>
            </Form>
          </form>
          <div className="workspace-settings-location"><FolderOutlined /><div><span>本地目录</span><code id="workspace-root">{current.rootPath}</code></div></div>
        </>
      ) : null}
    </DrawerShell>
  );
}
