import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Descriptions, Form, Input, Space, Typography } from 'antd';
import { workspaceApi, type WorkspaceResponse } from '../api';
import { useAppShell } from '../app/AppShellContext';

type WorkspaceData = WorkspaceResponse & { revision: string; workspace: WorkspaceResponse['workspace'] & { description: string } };

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
        const data = await workspaceApi.read() as WorkspaceData;
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
      const data = await workspaceApi.update({ revision: current.revision, name, description }) as WorkspaceData;
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
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>工作空间设置</Typography.Title>
          <p className="page-copy">只修改稳定元数据；身份、目录和数据格式版本始终保持只读。</p>
        </div>
      </section>
      <div id="settings-migration" className={migrationMessage ? '' : 'hidden'} role="status">
        {migrationMessage ? <Alert type="warning" showIcon message={migrationMessage} style={{ marginBottom: 16 }} /> : null}
      </div>
      <section className="content-grid settings-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">基本信息</p>
              <Typography.Title level={4} style={{ margin: 0 }}>名称与说明</Typography.Title>
            </div>
            <span id="workspace-save-state" className="state">{saveState}</span>
          </div>
          <form id="workspace-form" onSubmit={(event) => void onSubmit(event)}>
          <Form layout="vertical" component={false}>
            <Form.Item label="名称" required>
              <Input
                id="workspace-name"
                name="name"
                autoComplete="off"
                required
                disabled={!current || readOnly}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Form.Item>
            <Form.Item label="说明" required>
              <Input.TextArea
                id="workspace-description-input"
                name="description"
                rows={7}
                required
                disabled={!current || readOnly}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Form.Item>
            <Space>
              <Button id="workspace-save-button" type="primary" htmlType="submit" disabled={!current || readOnly}>
                保存修改
              </Button>
            </Space>
          </Form>
          </form>
        </article>
        <aside className="panel facts-panel">
          <p className="eyebrow">技术事实</p>
          <Typography.Title level={4} style={{ marginTop: 0 }}>只读事实</Typography.Title>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="工作空间 ID"><span id="workspace-id">{current?.workspace.id || '迁移后生成'}</span></Descriptions.Item>
            <Descriptions.Item label="本地目录"><span id="workspace-root">{current?.rootPath || '—'}</span></Descriptions.Item>
            <Descriptions.Item label="数据格式版本"><span id="workspace-schema">{current?.schemaVersion || '—'}</span></Descriptions.Item>
            <Descriptions.Item label="修订版本"><span id="workspace-revision">{current?.revision || '—'}</span></Descriptions.Item>
          </Descriptions>
        </aside>
      </section>
    </>
  );
}
