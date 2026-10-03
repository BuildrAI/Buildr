import { useState, type ReactElement } from 'react';
import type { PopoverProps } from 'antd';
import { SelectableHoverCard } from '../../../components/SelectableHoverCard';
import { CommitInfoContent } from './CommitInfoContent';
import type { SourceControlCommit } from '../source-control-model';

type Props = { commit: SourceControlCommit; children: ReactElement; onOpenTask(taskId: string): void; placement?: PopoverProps['placement']; sideBoundary?: string };

/** Keep hover information light; full information belongs in the selected reader. */
export function CommitInfoPopover({ commit, children, onOpenTask, placement = 'bottomLeft', sideBoundary }: Props) {
  const [open, setOpen] = useState(false);
  return <SelectableHoverCard sideBoundary={sideBoundary} focusTrigger="keyboard" closeOnTriggerClick open={open} onOpenChange={setOpen} title="提交摘要" placement={placement} content={<CommitInfoContent commit={commit} compact onOpenTask={id => { setOpen(false); onOpenTask(id); }} />}>{children}</SelectableHoverCard>;
}
