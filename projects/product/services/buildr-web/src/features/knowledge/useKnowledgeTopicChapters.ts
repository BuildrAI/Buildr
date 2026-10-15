import { useEffect, useRef, useState, type RefObject } from 'react';

type Chapter = { id: string; kind: string };

/** Locate within this reading surface: the same article may also be open in another pane. */
export function scrollKnowledgeTopicChapter(root: HTMLElement, id: string): boolean {
  const chapter = Array.from(root.querySelectorAll<HTMLElement>('[data-knowledge-chapter]'))
    .find(element => element.dataset.knowledgeChapter === id);
  const host = root.closest<HTMLElement>('.pane-body, .ant-drawer-body');
  if (!chapter || !host) return false;
  const sticky = root.querySelector<HTMLElement>('.knowledge-sticky-navigation');
  host.scrollTo({ top: Math.max(0, host.scrollTop + chapter.getBoundingClientRect().top - host.getBoundingClientRect().top - (sticky?.offsetHeight || 0) - 12) });
  return true;
}

/** Chapters keep the topic identity and reuse its existing scroll container and history. */
export function useKnowledgeTopicChapters(root: RefObject<HTMLElement | null>, topicId: string | null, artifacts: Chapter[]) {
  const ids = topicId ? artifacts.filter(item => item.kind === 'document' || item.kind === 'terms').map(item => item.id) : [];
  const key = JSON.stringify([topicId, ids]);
  const [selection, setSelection] = useState<{ key: string; id: string } | null>(null);
  const frame = useRef<number | null>(null);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, [key]);
  const select = (id: string) => {
    if (!ids.includes(id)) return false;
    setSelection({ key, id });
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    // Compact navigation closes its disclosure before the new chapter position is measured.
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (root.current) scrollKnowledgeTopicChapter(root.current, id);
    });
    return true;
  };
  return { select, selected: selection?.key === key ? selection.id : null };
}
