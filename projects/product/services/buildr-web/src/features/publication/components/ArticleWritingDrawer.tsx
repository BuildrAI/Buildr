import { useState } from 'react';
import { Alert, Button, Drawer, Form, Input, Select, message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import type { ArticleProject, Publication } from '../api/publication-api';
import { buildWritingRequest, writingMethods } from '../publication-model';

type Props = { onClose: () => void; projects: ArticleProject[]; defaultProject?: string; article?: Publication; revision?: string; initialMethod?: string; hasUnsavedChanges?: boolean };
export function ArticleWritingDrawer({ onClose, projects, defaultProject, article, revision, initialMethod, hasUnsavedChanges }: Props) {
  const [projectCode, setProjectCode] = useState(article?.projectCode || defaultProject || projects[0]?.code || '');
  const [method, setMethod] = useState(initialMethod || (article ? '润色表达' : '起草文章'));
  const [goal, setGoal] = useState(''), [materials, setMaterials] = useState(''), [prompt, setPrompt] = useState(''), [error, setError] = useState('');
  const [messages, holder] = message.useMessage();
  const change = (update: () => void) => { update(); setPrompt(''); setError(''); };
  const prepare = () => {
    try { setPrompt(buildWritingRequest({ projectCode, projectName: article?.projectName || projects.find(project => project.code === projectCode)?.name || projectCode, method, goal, materials, article, revision, hasUnsavedChanges })); setError(''); }
    catch (err) { setError(err instanceof Error ? err.message : '请求未准备好'); }
  };
  return <Drawer open width={480} title="交给智能体（Agent）写作" onClose={onClose} className="publication-writing-drawer" footer={<><Button type="primary" block onClick={prepare}>准备写作请求</Button><p className="publication-hint">准备后可复制交给智能体（Agent），尚未开始执行。</p></>}>
    {holder}
    <div className="publication-context"><span>当前范围</span><strong>{article?.title || '新文章'}</strong>{article ? <span>{article.projectName}</span> : <Select aria-label="写作所属项目" value={projectCode || undefined} onChange={value => change(() => setProjectCode(value))} options={projects.map(project => ({ value: project.code, label: project.name }))} />}</div>
    <div className="publication-methods">{writingMethods.map(item => <button key={item.value} type="button" className={item.value === method ? 'selected' : ''} onClick={() => change(() => setMethod(item.value))}><strong>{item.value}</strong><span>{item.description}</span></button>)}</div>
    {hasUnsavedChanges && <Alert type="warning" message="当前还有未保存修改，请先保存，再让智能体接续最新稿件。" />}
    <Form layout="vertical">
      <Form.Item label="你希望得到怎样的文章？" required><Input.TextArea id="article-writing-goal" rows={5} value={goal} onChange={event => change(() => setGoal(event.target.value))} placeholder="写给谁看？希望讲清什么？有哪些必须保留的事实或语气要求？" /></Form.Item>
      <Form.Item label="参考材料（选填）"><Input.TextArea id="article-writing-materials" rows={3} value={materials} onChange={event => change(() => setMaterials(event.target.value))} placeholder="补充素材、相关知识或需要核实的问题" /></Form.Item>
    </Form>
    <p className="publication-hint">智能体（Agent）根据目标选择已安装且适用的技能（Skill）。这里提供写作方法，不表示已有专项技能或已执行。</p>
    {error && <Alert type="error" message={error} />}
    {prompt && <section className="publication-prepared"><Alert type="success" message="写作请求已准备好，尚未执行。" /><pre id="article-writing-prompt">{prompt}</pre><Button icon={<CopyOutlined />} onClick={() => { void navigator.clipboard.writeText(prompt).then(() => messages.success('已复制写作请求，尚未执行')).catch(() => messages.error('自动复制失败，请选择请求文本复制')); }}>复制写作请求</Button></section>}
  </Drawer>;
}
