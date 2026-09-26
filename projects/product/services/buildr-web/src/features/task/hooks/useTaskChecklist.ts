import { useSideReading } from '../../../components/useSideReading';
import type { RefObject } from 'react';
export function useTaskChecklist(taskId: string, rootRef: RefObject<HTMLElement | null>) {
  return useSideReading(taskId, rootRef, 'task-checklist');
}
