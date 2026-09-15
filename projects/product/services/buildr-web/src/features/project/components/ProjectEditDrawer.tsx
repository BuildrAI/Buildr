import { type ProjectResponse, projectApi } from '../api/project-api';
import { useEffect, useState, type FormEvent } from 'react';
import { useAppShell } from '../../../app/AppShellContext';
import { MetadataEditDrawer } from '../../../components/MetadataEditDrawer';
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
  const { refreshNavigation } = useAppShell();
  const [current, setCurrent] = useState<ProjectEditPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [editAlert, setEditAlert] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
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
  }, [open, projectCode]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!current || !projectCode || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const updated = await projectApi.updateProject(projectCode, {
        revision: current.revision,
        name,
        description,
      }) as ProjectEditPayload;
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
      const code = (err as { code?: string }).code;
      setSaveError(code === 'project_revision_conflict' ? '内容已被修改。当前输入已保留，请重新打开后核对。' : (err instanceof Error ? err.message : '保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const readOnly = Boolean(current?.migrationRequired);

  return (
    <MetadataEditDrawer
      title="编辑项目" objectName={current?.project.name || projectCode || ''}
      open={open} onClose={onClose} saving={saving} dirty={Boolean(current && (name !== current.project.name || description !== (current.project.description || '')))}
      disabled={readOnly || loading || !current || Boolean(loadError)}
      formId="project-edit-form" saveButtonId="project-save-button"
    >
      {loading ? (
        <p className="page-copy">正在读取…</p>
      ) : loadError ? (
        <Alert type="error" showIcon message={loadError} />
      ) : current ? (
        <>
          <p className="page-copy">修改项目名称与说明。代码位置和来源不会改变。</p>
          <div id="project-edit-alert" className={editAlert || saveError ? '' : 'hidden'} role="status">
            {editAlert ? <Alert type="warning" showIcon message={editAlert} style={{ marginBottom: 16 }} /> : null}
            {saveError ? <Alert type="error" showIcon message={saveError} style={{ marginBottom: 16 }} /> : null}
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
