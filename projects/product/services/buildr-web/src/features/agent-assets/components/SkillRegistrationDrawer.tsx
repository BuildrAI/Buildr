import { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Select } from 'antd';
import { DrawerShell } from '../../../components/DrawerShell';
import { RefreshButton } from '../../../components/RefreshButton';
import { agentAssetsApi } from '../api/agent-assets-api';
export function SkillRegistrationDrawer({ onClose, onSaved, onAgent }: { onClose: () => void; onSaved: () => void; onAgent: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof agentAssetsApi.skillCandidates>>>();
  const [selected, setSelected] = useState<string>(), [id, setId] = useState(''), [description, setDescription] = useState(''), [content, setContent] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  useEffect(() => { const controller = new AbortController(); setData(undefined); setError(''); void agentAssetsApi.skillCandidates(controller.signal).then(result => { if (!controller.signal.aborted) setData(result); }).catch(err => { if (!controller.signal.aborted) setError(err.message); }); return () => controller.abort(); }, [retry]);
  const candidate = data?.candidates.find(c => c.path === selected);
  return <DrawerShell open title="新增技能" sub="选择已有技能目录，或在 skills/ 下新建。" onClose={() => { if (!busy) onClose(); }} closeDisabled={busy} footer={<Button type="primary" form="skill-registration" htmlType="submit" loading={busy} disabled={!data || Boolean(selected && !candidate)}>保存技能</Button>}>
    <form id="skill-registration" onSubmit={async event => { event.preventDefault(); if (!data) return; setBusy(true); setError(''); try { await agentAssetsApi.registerSkill(candidate ? { revision: data.revision, path: candidate.path, observation: candidate.observation } : { revision: data.revision, id, description, content }); window.dispatchEvent(new Event('buildr:skills-changed')); onSaved(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}><Form layout="vertical" component={false}>
      {error && <Alert type="error" message={error} />}
      <Form.Item label="技能目录"><div className="resource-directory-picker"><Select aria-label="已有技能目录" showSearch allowClear optionFilterProp="label" value={selected} placeholder="可选，选择未登记目录" onChange={setSelected} options={data?.candidates.map(c => ({ label: `skills/${c.path}`, value: c.path }))} /><RefreshButton label="刷新技能目录" loading={!data && !error} onClick={() => setRetry(n => n + 1)} /></div></Form.Item>
      {candidate ? <p>{candidate.id}：{candidate.description}。保存只登记此目录，原文件保持不变。</p> : <><Form.Item label="技能标识" required><Input aria-label="技能标识" required pattern="[A-Za-z0-9]([A-Za-z0-9._]|-)*" value={id} onChange={e => setId(e.target.value)} /></Form.Item><Form.Item label="技能描述" required><Input aria-label="技能描述" required value={description} onChange={e => setDescription(e.target.value)} /></Form.Item><Form.Item label="技能正文" required><Input.TextArea aria-label="技能正文" required rows={10} value={content} onChange={e => setContent(e.target.value)} /></Form.Item><p className="page-copy">将新建 skills/{id || '<技能标识>'}/SKILL.md</p></>}
      {data?.diagnostics.length ? <Alert type="info" message={data.diagnostics.join('；')} /> : null}
      <Button type="link" onClick={onAgent}>通过智能体接入外部技能或生成内容</Button>
    </Form></form>
  </DrawerShell>;
}
