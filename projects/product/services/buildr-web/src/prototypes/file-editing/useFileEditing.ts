import { useMemo, useRef } from 'react';
import { useFileEditingController } from '../../app/FileEditingContext';
import type { FileEditingController, FileEditingDocument as Document, FileEditingOperations } from '../../components/file-editing/file-editing-types';
export type { FileEditingSession } from '../../components/file-editing/file-editing-types';

export type FileEditingDocument = Omit<Document, 'revision'> & { revision?: string; version?: string; protectedLines?: Array<{ start: number; end: number }> };
export type PrototypeFileEditingController = FileEditingController & {
  simulateSaveFailure(id: string): void;
  simulateExternalChange(id: string, content?: string): void;
  reset(id?: string): void;
};

function document(file: FileEditingDocument): Document {
  const offsets = file.content.split('\n').reduce<number[]>((values, line) => [...values, values.at(-1)! + line.length + 1], [0]);
  return { ...file, revision: file.revision || 'prototype:1', protectedRanges: file.protectedRanges || file.protectedLines?.map(range => ({ from: offsets[range.start - 1], to: Math.min(file.content.length, offsets[range.end]) })) };
}

/** Only this adapter simulates a disk. The editor, history and save queue are real shared code. */
export function useFileEditing(files: FileEditingDocument[]): PrototypeFileEditingController {
  const definitions = useRef(files.map(document));
  const disk = useRef(new Map(definitions.current.map(file => [file.id, file])));
  const failures = useRef(new Set<string>());
  const operations = useMemo<FileEditingOperations>(() => ({
    read: async file => disk.current.get(file.id)!,
    save: async (file, content, expectedRevision) => {
      await new Promise(resolve => setTimeout(resolve, 220));
      if (failures.current.has(file.id)) throw Error('文件暂时无法写入。你的输入已保留，可以重试保存。');
      const current = disk.current.get(file.id)!;
      if (current.revision !== expectedRevision) throw Object.assign(Error('文件已被外部修改。'), { code: 'file_revision_conflict', details: { current } });
      const next = { ...current, content, revision: 'prototype:' + (Number(current.revision.split(':').at(-1)) + 1) };
      disk.current.set(file.id, next); return next;
    },
  }), []);
  const { controller, store } = useFileEditingController(operations, definitions.current);
  return { ...controller,
    retry: async id => { failures.current.delete(id); await controller.retry(id); },
    simulateSaveFailure(id) { failures.current.add(id); void controller.saveNow(id); },
    simulateExternalChange(id, content) {
      const current = disk.current.get(id)!;
      const next = { ...current, content: content ?? current.content.replace(/\n?$/, '\n\n外部更新：补充了最新的协作说明。\n'), revision: 'prototype:' + (Number(current.revision.split(':').at(-1)) + 1) };
      disk.current.set(id, next); void controller.refresh(id);
    },
    reset(id) {
      failures.current.clear();
      if (id) { const file = definitions.current.find(item => item.id === id); if (file) disk.current.set(id, file); }
      else disk.current = new Map(definitions.current.map(file => [file.id, file]));
      store.reset([...disk.current.values()]);
    },
  };
}
