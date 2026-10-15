import { useEffect, useState } from 'react';
import { Alert, Button } from 'antd';
import { FileConflictDialog } from './FileConflictDialog';
import type { FileEditingController, FileEditingDocument, FileEditingSession } from './file-editing-types';

/** Shared save failures, protected ranges and conflict recovery for every file presentation. */
export function FileEditingFeedback({ file, session, editing, active = true }: { file: FileEditingDocument; session: FileEditingSession; editing: FileEditingController; active?: boolean }) {
  const [conflictOpen, setConflictOpen] = useState(false);
  const conflictKey = session.conflict ? file.id + ':' + session.conflict.file.revision : '';
  useEffect(() => { setConflictOpen(Boolean(conflictKey) && active); }, [conflictKey, active]);
  return <>
    {session.file.readOnlyReason && <Alert className="file-editing-notice" type="info" showIcon message={session.file.readOnlyReason} />}
    {session.file.protectedRanges?.length ? <Alert className="file-editing-notice" type="info" showIcon message="受管区块（Managed Block）由 Buildr 维护，区块外内容可以编辑。" /> : null}
    {session.protectedMessage && <Alert className="file-editing-notice" type="warning" showIcon message={session.protectedMessage} />}
    {session.bindingError && <Alert className="file-editing-notice" type="error" showIcon message="文件来源已变化，保存已暂停" description={session.bindingError} action={<Button size="small" onClick={() => void editing.reviewSource(file.id)}>核对最新来源</Button>} />}
    {session.readError && <Alert className="file-editing-notice" type="warning" showIcon message="暂时无法核对文件最新状态" description={session.readError} action={<Button size="small" onClick={() => void editing.refresh(file.id)}>重新核对</Button>} />}
    {session.status === 'error' && !session.bindingError && <Alert className="file-editing-notice" type="error" showIcon message="保存失败，输入已保留" description={session.error} action={<Button size="small" onClick={() => void editing.retry(file.id)}>重试保存</Button>} />}
    {session.conflict && <Alert className="file-editing-notice" type="warning" showIcon message="文件已被外部修改，自动保存已暂停" description="你的输入和磁盘最新内容都已保留。处理差异后继续保存。" action={<Button size="small" onClick={() => setConflictOpen(true)}>处理冲突</Button>} />}
    {session.conflict && active && <FileConflictDialog file={file} session={session} editing={editing} open={conflictOpen} onClose={() => setConflictOpen(false)} />}
  </>;
}
