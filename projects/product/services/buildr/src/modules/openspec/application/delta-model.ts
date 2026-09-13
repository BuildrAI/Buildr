export type DeltaOperation = { capability: string } & (
  | { type: 'ADDED' | 'MODIFIED' | 'REMOVED'; title: string; requirement: string; from?: never; to?: never }
  | { type: 'RENAMED'; from: string; to: string; title?: never; requirement?: never }
  | { type: 'RENAMED_SCENARIO'; requirement: string; from: string; to: string; title?: never }
);
export type OpenSpecDelta = { hash: string; operations: DeltaOperation[]; capabilities: Map<string, { file: string; content: string; operations: DeltaOperation[] }> };
