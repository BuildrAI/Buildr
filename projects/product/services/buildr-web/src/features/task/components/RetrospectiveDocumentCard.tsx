import { useEffect, useState } from 'react';
import { Alert, Button, Spin } from 'antd';
import { useTaskRetrospective } from '../hooks/useTaskRetrospective';
import type { RetrospectiveDocumentReference } from '../../../../build/generated/task-dto';
import { MarkdownHost } from '../../../components/MarkdownHost';
import { DrawerShell } from '../../../components/DrawerShell';
import './RetrospectiveDocumentCard.css';

type Props = { taskId: string; recordDigest: string; reference: RetrospectiveDocumentReference; onRecordUpdated(): Promise<void>; inline?: boolean; refreshToken?: number };
const stateLabel = { 'pending-decision': '等待你的决定', decided: '已经决定' };
export function RetrospectiveDocumentCard({ taskId, recordDigest, reference, onRecordUpdated, inline, refreshToken = 0 }: Props) {
  const retrospective = useTaskRetrospective(taskId, recordDigest, onRecordUpdated);
  const [deciding, setDeciding] = useState(false);
  useEffect(() => { if (inline) void retrospective.load(); }, [inline, refreshToken, recordDigest, reference.registered?.documentDigest, retrospective.load]);
  const document = retrospective.document;
  return <section className="task-reader retrospective-document-card" id="task-retrospective-document-card"><h2>任务复盘</h2><p id="task-retrospective-document-state">{reference.registered ? stateLabel[reference.registered.state] : '无复盘文档'}</p><code>{reference.path}</code>
    {!inline && reference.registered && <Button id="task-retrospective-document-open" onClick={() => void retrospective.load()}>查看复盘</Button>}
    {retrospective.loading && <Spin size="small" />}{retrospective.error && <Alert type="warning" message={retrospective.error} />}
    {document?.diagnostic && <Alert type="warning" message={document.diagnostic.message} />}
    {document?.content ? <MarkdownHost markdown={document.content} className="markdown-body" options={{ headingOffset: 1 }} /> : !retrospective.loading && inline ? <p>本机复盘文档当前不可读取。</p> : null}
    {document?.content && document.effectiveState === 'pending-decision' && document.actualDigest === document.registeredDigest && <Button id="task-retrospective-document-decide" onClick={() => setDeciding(true)}>记录完成决定</Button>}
    <DrawerShell open={deciding} title="记录完成决定" onClose={() => setDeciding(false)} footer={<div className="actions"><Button onClick={() => setDeciding(false)}>取消</Button><Button type="primary" loading={retrospective.updating} onClick={async () => { if (await retrospective.markDecided()) setDeciding(false); }}>我已完成决定</Button></div>}><p>确认你已经阅读复盘，并完成是否继续行动的决定。</p>{retrospective.error && <Alert type="warning" message={retrospective.error} />}</DrawerShell>
  </section>;
}
