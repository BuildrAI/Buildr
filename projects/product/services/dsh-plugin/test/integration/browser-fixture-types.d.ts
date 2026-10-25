import type { SourceRecordRequest } from '../../plugin/src/source-types.ts';
declare global {
  interface Window {
    sourceFixture: {
      requests: SourceRecordRequest[];
      records: { recordId: string; callId?: string }[];
      gate: { armed: boolean; started: boolean; released: boolean };
      armGate(): void;
      releaseGate(): void;
      mountDev(): Promise<void>;
      unload(): Promise<void>;
    };
  }
}
