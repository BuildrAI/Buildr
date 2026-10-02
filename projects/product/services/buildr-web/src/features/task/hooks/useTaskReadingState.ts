import { useEffect, useRef, useState } from 'react';
import type { TaskReadingTab, TaskReadTarget } from '../components/taskWorkContent';
import { createTaskReadingHistory, type TaskReadingSnapshot } from '../task-reading-history';

const history = createTaskReadingHistory();
const empty = (): TaskReadingSnapshot => ({ selected: 'requirements', choices: {}, trail: [], positions: {} });

/** Reading choices belong to this task view, independently of the recorded execution stage. */
export function useTaskReadingState(taskId: string, workspaceId: string | null = null, restoreHistory = false, navigation?: { key: string; taskBriefId?: string }) {
  const identity = JSON.stringify([workspaceId, taskId]);
  const initial = useRef((restoreHistory && (history.read(workspaceId, taskId, navigation?.key) || history.read(workspaceId, taskId))) || empty());
  const [selected, setSelected] = useState<TaskReadingTab>(initial.current.selected);
  const [choices, setChoices] = useState<Record<string, string>>(initial.current.choices);
  const [trail, setTrail] = useState<TaskReadTarget[]>(initial.current.trail);
  const rootRef = useRef<HTMLElement>(null);
  const positions = useRef<Record<string, number>>(initial.current.positions);
  const appliedKey = useRef<string | null>(null);
  const currentIdentity = useRef(identity);
  const currentNavigation = useRef(navigation?.key);
  const snapshot = useRef({ workspaceId, taskId, selected, choices, trail, positions: positions.current, entry: navigation?.key });
  if (currentIdentity.current === identity && currentNavigation.current === navigation?.key) snapshot.current = { workspaceId, taskId, selected, choices, trail, positions: positions.current, entry: navigation?.key };
  const extraContent = trail.at(-1) || null;
  const readingKey = `${selected}:${choices[selected] || ''}:${choices[`${selected}:review`] || ''}:${choices['composite:tab'] || 'overview'}:${choices['composite:plan'] || 'record:brief'}`;
  const remember = () => {
    const host = rootRef.current?.querySelector('.task-node-reading, .composite-task-reader');
    if (host) positions.current[readingKey] = host.scrollTop;
  };
  useEffect(() => {
    const root = rootRef.current, host = root?.querySelector('.task-node-reading, .composite-task-reader');
    if (!root || !host) return;
    const trackPosition = () => { positions.current[readingKey] = host.scrollTop; };
    host.addEventListener('scroll', trackPosition);
    if (appliedKey.current === readingKey) return () => host.removeEventListener('scroll', trackPosition);
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
    return () => { observer.disconnect(); host.removeEventListener('scroll', trackPosition); };
  });
  useEffect(() => {
    const taskChanged = currentIdentity.current !== identity;
    const entryChanged = currentNavigation.current !== navigation?.key;
    if (taskChanged || entryChanged) {
      const restored = restoreHistory ? history.read(workspaceId, taskId, navigation?.key) || (taskChanged ? history.read(workspaceId, taskId) : null) : null;
      currentIdentity.current = identity;
      currentNavigation.current = navigation?.key;
      if (restored || taskChanged) {
        const next = restored || empty();
        setSelected(next.selected); setChoices(next.choices); setTrail(next.trail);
        positions.current = next.positions; appliedKey.current = null;
        snapshot.current = { workspaceId, taskId, ...next, entry: navigation?.key };
      } else if (!restoreHistory && navigation?.taskBriefId === taskId) {
        const nextChoices = { ...choices, 'composite:tab': 'overview', 'composite:plan': 'record:brief' };
        setSelected('requirements'); setChoices(nextChoices); setTrail([]); positions.current = { ...positions.current, 'requirements::overview:record:brief': 0 }; appliedKey.current = null;
        snapshot.current = { workspaceId, taskId, selected: 'requirements', choices: nextChoices, trail: [], positions: positions.current, entry: navigation?.key };
      } else snapshot.current = { workspaceId, taskId, selected, choices, trail, positions: positions.current, entry: navigation?.key };
    }
    return () => {
      const value = snapshot.current;
      history.remember(value.workspaceId, value.taskId, value);
      if (value.entry) history.remember(value.workspaceId, value.taskId, value, value.entry);
    };
  }, [identity, navigation?.key]);
  const selectNode = (tab: TaskReadingTab) => { remember(); setSelected(tab); setTrail([]); };
  const choose = (key: string, value: string) => { remember(); setChoices(current => ({ ...current, [key]: value })); };
  const openExtra = (target: TaskReadTarget) => { setTrail(current => [...current, target]); };
  const closeExtra = () => { setTrail(current => current.slice(0, -1)); };
  return { selected, choices, extraContent, rootRef, selectNode, choose, openExtra, closeExtra, clearExtra: () => setTrail([]), replaceExtra: (target: TaskReadTarget) => setTrail(current => [...current.slice(0,-1), target]) };
}
