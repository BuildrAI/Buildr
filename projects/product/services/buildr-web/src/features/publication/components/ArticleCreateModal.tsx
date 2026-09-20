import { useState } from 'react';
import { Alert, Form, Input, Modal, Select } from 'antd';
import { publicationApi, type ArticleProject, type PublicationDetail } from '../api/publication-api';
type Props = { projects: ArticleProject[]; defaultProject?: string; onClose: () => void; onCreated: (detail: PublicationDetail) => void };
export function ArticleCreateModal({ projects, defaultProject, onClose, onCreated }: Props) {
  const [project, setProject] = useState(projects.some(project => project.code === defaultProject) ? defaultProject! : projects[0]?.code || ''), [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const create = async () => {
    if (!project || !title.trim()) { setError('请选择所属项目并填写文章标题'); return; }
    setBusy(true); setError('');
    try { onCreated(await publicationApi.create(project, title.trim())); }
    catch (err) { setError(err instanceof Error ? err.message : '新建文章失败'); }
    finally { setBusy(false); }
  };
  return <Modal open title="新建文章" okText="创建草稿" cancelText="取消" confirmLoading={busy} onOk={() => void create()} onCancel={() => !busy && onClose()} maskClosable={!busy} closable={!busy}>
    {error && <Alert type="error" message={error} />}
    <Form layout="vertical">
      <Form.Item label="所属项目" required><Select id="article-create-project" value={project || undefined} onChange={setProject} options={projects.map(item => ({ value: item.code, label: item.name }))} /></Form.Item>
      <Form.Item label="文章标题" required><Input id="article-create-title" autoFocus maxLength={150} value={title} onChange={event => setTitle(event.target.value)} onPressEnter={() => void create()} placeholder="例如：一次工作空间实践" /></Form.Item>
    </Form><p className="publication-hint">先创建一篇草稿，直接编写，也可以交给智能体（Agent）接着写。</p>
  </Modal>;
}
