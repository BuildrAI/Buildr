import { useEffect, useState } from 'react';
import { Alert, Modal } from 'antd';
import { agentAssetsApi, type SkillSummary } from '../api/agent-assets-api';
export function SkillRemoveDialog({ skill, onClose, onRemoved }: { skill: SkillSummary; onClose: () => void; onRemoved: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof agentAssetsApi.skillRemoval>>>(), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { const controller = new AbortController(); void agentAssetsApi.skillRemoval(skill.id, controller.signal).then(result => { if (!controller.signal.aborted) setData(result); }).catch(err => { if (!controller.signal.aborted) setError(err.message); }); return () => controller.abort(); }, [skill.id]);
  return <Modal open title={`移除技能：${skill.title}`} okText="移除" cancelText="取消" confirmLoading={busy} okButtonProps={{ danger: true, disabled: !data?.removable || Boolean(error) }} onCancel={() => { if (!busy) onClose(); }} onOk={async () => { if (!data) return; setBusy(true); setError(''); try { await agentAssetsApi.removeSkill(skill.id, data.revision); window.dispatchEvent(new Event('buildr:skills-changed')); onRemoved(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); } }}>
    <p>只移除登记，保留技能源目录和全部文件。已有运行时投射需要另行同步。</p>
    {!data && !error && <p>正在核对登记与引用…</p>}
    {data?.reason && <Alert type="warning" message={data.reason} />}
    {data?.impacts.length ? <Alert type="warning" message="以下能力引用会受影响，移除后需要重新选择提供者。" description={<ul>{data.impacts.map((impact, index) => <li key={index}>{String(impact.consumer || '引用方')}：{String(impact.capability || '能力引用')} · {String(impact.scope || '工作空间')}</li>)}</ul>} /> : null}
    {error && <Alert type="error" message={error} />}
  </Modal>;
}
