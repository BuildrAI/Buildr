import { useEffect, useRef, useState } from 'react';
import type { TaskNodeStage, TaskReadTarget } from '../components/taskWorkContent';

/** Reading choices belong to this task view, independently of the recorded execution stage. */
export function useTaskReadingState(taskId: string) {
  const [selected, setSelected] = useState<TaskNodeStage>('requirements');
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [trail, setTrail] = useState<TaskReadTarget[]>([]);
  const rootRef = useRef<HTMLElement>(null);
  const positions = useRef<Record<string, number>>({});
  const appliedKey = useRef<string | null>(null);
  const extraContent = trail.at(-1) || null;
  const readingKey = `${selected}:${choices[selected] || ''}:${choices[`${selected}:review`] || ''}`;
  const remember = () => {
    const host = rootRef.current?.querySelector('.task-node-reading');
    if (host) positions.current[readingKey] = host.scrollTop;
  };
  useEffect(() => {
    const root = rootRef.current, host = root?.querySelector('.task-node-reading');
    if (!root || !host || appliedKey.current === readingKey) return;
    // Markdown fills its DOM in a passive effect; restore only after content is ready.
    const restore = () => {
      if (root.querySelector('.task-node-content .task-content-loading, .task-node-content .task-document-preview-loading, .task-node-content .ant-spin-spinning')) return;
      host.scrollTop = positions.current[readingKey] || 0;
      appliedKey.current = readingKey;
      observer.disconnect();
    };
    const observer = new MutationObserver(restore);
    observer.observe(root, {childList: true, subtree: true, attributes: true, attributeFilter: ['class']});
    restore();
    return () => observer.disconnect();
  });
  useEffect(() => { setSelected('requirements'); setChoices({}); setTrail([]); positions.current = {}; appliedKey.current = null; }, [taskId]);
  const selectNode = (stage: TaskNodeStage) => { remember(); setSelected(stage); setTrail([]); };
  const choose = (key: string, value: string) => { remember(); setChoices(current => ({ ...current, [key]: value })); };
  const openExtra = (target: TaskReadTarget) => { setTrail(current => [...current, target]); };
  const closeExtra = () => { setTrail(current => current.slice(0, -1)); };
  return { selected, choices, extraContent, rootRef, selectNode, choose, openExtra, closeExtra, clearExtra: () => setTrail([]), replaceExtra: (target: TaskReadTarget) => setTrail(current => [...current.slice(0,-1), target]) };
}
