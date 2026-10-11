import type { EditorState, Transaction } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import type { MarkdownImageContext } from '../../lib/markdownImages';

export type FileEditingDocument = {
  /** Workspace-scoped identity of the actual file, independent of its entry point. */
  id: string;
  path: string;
  content: string;
  kind: 'markdown' | 'text';
  location: string;
  revision: string;
  sourceRevision?: string;
  /** Identity of the source selector only; mutable snapshots never participate. */
  sourceKey?: string;
  observedAt?: string;
  imageContext?: MarkdownImageContext | null;
  selector?: unknown;
  locationLabel?: string;
  versionLabel?: string;
  readOnlyReason?: string;
  /** UTF-16 offsets in the original, unnormalised content. */
  protectedRanges?: Array<{ from: number; to: number }>;
};

export type FileEditingOperations = {
  save(file: FileEditingDocument, content: string, expectedRevision: string): Promise<FileEditingDocument>;
  read?(file: FileEditingDocument): Promise<FileEditingDocument>;
};

export type FileEditingSession = {
  file: FileEditingDocument;
  content: string;
  diskContent: string;
  baseContent: string;
  editorState: EditorState;
  mode: 'read' | 'edit';
  status: 'saved' | 'saving' | 'error' | 'conflict';
  savedAt: string | null;
  revision: string;
  historyIndex: number;
  composing: boolean;
  error?: string;
  protectedMessage?: string;
  readError?: string;
  bindingError?: string;
  mergeContent?: string;
  mergeEditorState?: EditorState;
  mergeObservedRevision?: string;
  mergeStale?: boolean;
  conflict?: { base: string; disk: string; file: FileEditingDocument; reason?: 'source' };
};

export type FileEditingController = {
  sessions: Record<string, FileEditingSession>;
  ensure(file: FileEditingDocument): void;
  watch(id: string): () => void;
  setMode(id: string, mode: 'read' | 'edit'): void;
  applyTransactions(id: string, transactions: readonly Transaction[]): boolean;
  setLanguage(id: string, language: Extension): void;
  setComposing(id: string, value: boolean): void;
  change(id: string, content: string): void;
  undo(id: string): void;
  redo(id: string): void;
  saveNow(id: string): Promise<void>;
  retry(id: string): Promise<void>;
  refresh(id: string): Promise<void>;
  reviewSource(id: string): Promise<void>;
  applyMergeTransactions(id: string, transactions: readonly Transaction[]): void;
  resolveConflict(id: string, content: string): Promise<boolean>;
  acceptDisk(id: string): void;
};
