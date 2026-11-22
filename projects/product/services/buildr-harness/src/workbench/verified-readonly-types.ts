export interface VerifiedReadonlyRequest { root: string; relative: string; maxBytes: number }
export type VerifiedReadonlyResult = { ok: true; bytes: Buffer } | { ok: false; error: Error };
