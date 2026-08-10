import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Form, Input, Space, Typography } from 'antd';
import { api } from '../api';
import { useAppShell } from '../app/AppShellContext';
import { workspaceHref } from '../lib/labels';

type ProjectEditData = {
  revision: string;
  migrationRequired?: boolean;
  nextActions?: string[];
  project: {
    code: string;
    name: string;
    description: string;
    source: { path: string };
  };
};

type WorkspacePayload = { rootPath: string; workspace: { name: string } };

export function ProjectEditPage() {
  const { projectCode = '' } = useParams();
  const { workspaceId, setWorkspace, setBreadcrumbParts } = useAppShell();
  const href = (path: string) => workspaceHref(workspaceId, path);
  const [current, setCurrent] = useState<ProjectEditData | null>(null);
  const [saveState, setSaveState] = useState('正在读取');
  const [alert, setAlert] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [workspace, data] = await Promise.all([
          api('/api/v1/workspace') as Promise<WorkspacePayload>,
          api(`/api/v1/projects/${encodeURIComponent(projectCode)}`) as Promise<ProjectEditData>,
        ]);
        if (cancelled) return;
        setWorkspace(workspace);
        setCurrent(data);
        setBreadcrumbParts([workspace.workspace.name, '项目', data.project.name, '编辑']);
        const readOnly = Boolean(data.migrationRequired);
        setSaveState(readOnly ? '迁移前只读' : '可以修改');
        setAlert(readOnly ? (data.nextActions || []).join(' ') : '');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '无法编辑项目');
      }
    })();
    return () => { cancelled = true; };
  }, [projectCode, setWorkspace, setBreadcrumbParts]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!current) return;
    const form = event.currentTarget;
    const nameInput = form.elements.namedItem('name') as HTMLInputElement;
    const descriptionInput = form.elements.namedItem('description') as HTMLTextAreaElement;
    setSaveState('正在保存…');
    try {
      const updated = await api(`/api/v1/projects/${encodeURIComponent(projectCode)}`, {
        method: 'PUT',
        body: JSON.stringify({
          revision: current.revision,
          name: nameInput.value,
          description: descriptionInput.value,
        }),
      }) as ProjectEditData;
      setCurrent(updated);
      setAlert(updated.migrationRequired ? (updated.nextActions || []).join(' ') : '');
      setSaveState('保存成功');
    } catch (err) {
      const code = (err as { code?: string }).code;
      setSaveState(code === 'project_revision_conflict' ? 'registry 已变化，请刷新' : (err instanceof Error ? err.message : '保存失败'));
    }
  };

  if (error) {
    return (
      <section className="page-header">
        <Typography.Title level={2}>无法编辑项目</Typography.Title>
        <p className="page-copy">{error}</p>
      </section>
    );
  }

  const readOnly = Boolean(current?.migrationRequired);
  const detailHref = href(`/projects/${encodeURIComponent(projectCode)}`);

  return (
    <>
      <section className="detail-page-header">
        <Link className="back-link" to={detailHref}>← 返回项目详情</Link>
        <p className="eyebrow">编辑项目</p>
        <Typography.Title id="project-edit-name" level={2} style={{ margin: 0 }}>
          {current?.project.name || '正在读取…'}
        </Typography.Title>
        <p className="page-copy">仅修改稳定元数据；身份、来源和 Git 观察状态保持只读。</p>
      </section>
      <div id="project-edit-alert" className={alert ? '' : 'hidden'} role="status">
        {alert ? <Alert type="warning" showIcon message={alert} style={{ marginBottom: 16 }} /> : null}
      </div>
      <section className="edit-layout">
        <div className="edit-form panel">
          <div className="section-heading">
            <div><Typography.Title level={4} style={{ margin: 0 }}>名称与说明</Typography.Title></div>
            <span id="project-save-state" className="state">{saveState}</span>
          </div>
          <form
            id="project-edit-form"
            key={current?.revision || 'loading'}
            onSubmit={(event) => void onSubmit(event)}
          >
          <Form layout="vertical" component={false}>
            <Form.Item label="名称" required>
              <Input
                id="project-name"
                name="name"
                autoComplete="off"
                required
                disabled={!current || readOnly}
                defaultValue={current?.project.name || ''}
              />
            </Form.Item>
            <Form.Item label="说明" required>
              <Input.TextArea
                id="project-description"
                name="description"
                rows={6}
                required
                disabled={!current || readOnly}
                defaultValue={current?.project.description || ''}
              />
            </Form.Item>
            <Space>
              <Link to={detailHref}><Button>取消</Button></Link>
              <Button id="project-save-button" type="primary" htmlType="submit" disabled={!current || readOnly}>
                保存修改
              </Button>
            </Space>
          </Form>
          </form>
        </div>
        <aside className="read-only-section panel">
          <details className="technical-details" open>
            <summary>技术信息</summary>
            <dl className="read-facts technical-facts">
              <div><dt>项目代码</dt><dd id="project-code">{current?.project.code || '—'}</dd></div>
              <div><dt>修订版本</dt><dd id="project-revision">{current?.revision || '—'}</dd></div>
              <div><dt>来源路径</dt><dd id="project-path">{current?.project.source.path || '—'}</dd></div>
            </dl>
          </details>
        </aside>
      </section>
    </>
  );
}
