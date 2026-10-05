import { type ProjectResponse, projectApi } from '../api/project-api';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAppShell } from '../../../app/AppShellContext';
import { MetadataEditDrawer } from '../../../components/MetadataEditDrawer';
import { MetadataConflictNotice } from '../../../components/MetadataConflictNotice';
import { rebaseEditedFields } from '../../../lib/metadata-recovery';
import { Alert, Form, Input } from 'antd';


type ProjectEditPayload = ProjectResponse & { revision: string; project: NonNullable<ProjectResponse['project']> };

export type ProjectEditSaved = {
  code: string;
  name: string;
  description: string;
  revision: string;
};

type Props = {
  open: boolean;
  projectCode: string | null;
  onClose: () => void;
  onSaved?: (project: ProjectEditSaved) => void;
};

export function ProjectEditDrawer({ open, projectCode, onClose, onSaved }: Props) {
  const { refreshNavigation, workspaceId } = useAppShell();
  const [current, setCurrent] = useState<ProjectEditPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [editAlert, setEditAlert] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [conflict, setConflict] = useState(false);
  const [latest, setLatest] = useState<ProjectEditPayload | null>(null);
  const [readingLatest, setReadingLatest] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const busy = useRef(false);
  const scope = useRef({ workspaceId, projectCode, open });
  if (scope.current.workspaceId !== workspaceId || scope.current.projectCode !== projectCode || scope.current.open !== open) scope.current = { workspaceId, projectCode, open };
  useEffect(() => () => { scope.current = { ...scope.current, open: false }; }, []);

  useEffect(() => {
    setConflict(false); setLatest(null); setRecoveryError(''); setReadingLatest(false); busy.current = false;
    if (!open || !projectCode) {
      setCurrent(null);
      setLoadError('');
      setSaveError('');
      setEditAlert('');
      setLoading(false);
      setSaving(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    setSaveError('');
    void (async () => {
      try {
        const data = await projectApi.project(projectCode) as ProjectEditPayload;
        if (cancelled) return;
        setCurrent(data);
        setName(data.project.name);
        setDescription(data.project.description || '');
        setEditAlert(data.migrationRequired ? (data.nextActions || []).join(' ') : '');
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : '无法读取项目');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, projectCode, workspaceId]);

  const readLatest = async () => {
    if (!projectCode || busy.current) return;
    const observedScope = scope.current;
    busy.current = true; setReadingLatest(true); setRecoveryError(''); setLatest(null);
    try {
      const data = await projectApi.project(projectCode) as ProjectEditPayload;
      if (scope.current !== observedScope) return;
      if (!data.project || !data.revision) throw new Error('项目暂时不可确认，输入仍保留。');
      setLatest(data);
    } catch (err) {
      if (scope.current === observedScope) setRecoveryError(err instanceof Error ? err.message : '最新内容读取失败，请重试。');
    } finally {
      if (scope.current === observedScope) { busy.current = false; setReadingLatest(false); }
    }
  };
  const save = async (base: ProjectEditPayload, draft = { name, description }) => {
    if (!projectCode || busy.current || base.migrationRequired || !draft.name.trim() || !draft.description.trim()) return;
    const observedScope = scope.current;
    busy.current = true;
    setSaving(true);
    setSaveError('');
    setCurrent(base); setName(draft.name); setDescription(draft.description);
    try {
      const updated = await projectApi.updateProject(projectCode, {
        revision: base.revision,
        ...draft,
      }) as ProjectEditPayload;
      if (scope.current !== observedScope) return;
      setCurrent(updated);
      setEditAlert(updated.migrationRequired ? (updated.nextActions || []).join(' ') : '');
      refreshNavigation();
      onSaved?.({
        code: updated.project.code,
        name: updated.project.name,
        description: updated.project.description || '',
        revision: updated.revision,
      });
      onClose();
    } catch (err) {
      if (scope.current !== observedScope) return;
      const code = (err as { code?: string }).code;
      if (code === 'project_revision_conflict') { setConflict(true); setLatest(null); setRecoveryError(err instanceof Error ? err.message : '项目版本已变化。'); }
      else setSaveError(err instanceof Error ? err.message : '保存失败，输入已保留。');
    } finally {
      if (scope.current === observedScope) { busy.current = false; setSaving(false); }
    }
  };
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (current && !conflict) void save(current);
  };
  const useLatest = () => {
    if (!latest || busy.current) return;
    setCurrent(latest); setName(latest.project.name); setDescription(latest.project.description || '');
    setConflict(false); setLatest(null); setRecoveryError(''); setSaveError('');
  };
  const keepChanges = () => {
    if (!current || !latest) return;
    void save(latest, rebaseEditedFields({ name: current.project.name, description: current.project.description || '' }, { name, description }, { name: latest.project.name, description: latest.project.description || '' }));
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(`名称：${name}\n说明：${description}`); }
    catch { setRecoveryError('自动复制失败，请直接选择并复制输入内容。'); }
  };

  const readOnly = Boolean(current?.migrationRequired || latest?.migrationRequired);

  return (
    <MetadataEditDrawer
      title="编辑项目" objectName={current?.project.name || projectCode || ''}
      open={open} onClose={onClose} saving={saving}
      disabled={readOnly || loading || !current || Boolean(loadError) || conflict || readingLatest || !name.trim() || !description.trim()}
      formId="project-edit-form" saveButtonId="project-save-button"
    >
      {loading ? (
        <p className="page-copy">正在读取…</p>
      ) : loadError ? (
        <Alert type="error" showIcon message={loadError} />
      ) : current ? (
        <>
          <p className="page-copy">修改项目名称与说明。代码位置和来源不会改变。</p>
          <div id="project-edit-alert" className={editAlert || saveError || conflict ? '' : 'hidden'} role="status">
            {editAlert ? <Alert type="warning" showIcon message={editAlert} style={{ marginBottom: 16 }} /> : null}
            {saveError ? <Alert type="error" showIcon message={saveError} style={{ marginBottom: 16 }} /> : null}
            {conflict && <MetadataConflictNotice latest={latest && <dl><dt>名称</dt><dd>{latest.project.name}</dd><dt>说明</dt><dd>{latest.project.description || '尚未填写'}</dd></dl>}
              loading={readingLatest} busy={saving} error={recoveryError} canContinue={Boolean(latest && !readOnly)} canSave={Boolean(name.trim() && description.trim())} onRead={() => void readLatest()} onUseLatest={useLatest} onKeep={keepChanges} onCopy={() => void copy()} />}
          </div>
          <form
            id="project-edit-form"
            key={current.revision}
            onSubmit={(event) => void onSubmit(event)}
          >
            <Form layout="vertical" component={false}>
              <Form.Item label="名称" required>
                <Input
                  id="project-name"
                  name="name"
                  autoComplete="off"
                  required
                  disabled={readOnly || saving}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Form.Item>
              <Form.Item label="说明" required>
                <Input.TextArea
                  id="project-description"
                  name="description"
                  rows={6}
                  required
                  disabled={readOnly || saving}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Form.Item>

            </Form>
          </form>
        </>
      ) : null}
    </MetadataEditDrawer>
  );
}
