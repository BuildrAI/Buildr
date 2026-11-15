type Timing = Pick<Performance, 'now' | 'measure' | 'clearMeasures'>;
/** Two bounded local spans. Request time includes browser queuing, transfer and server time. */
export async function timeAttachmentStage<T>(stage: 'read-file' | 'request', action: () => Promise<T>, timing: Timing | undefined = globalThis.performance): Promise<T> {
  let start: number | undefined;
  try { start = timing?.now(); } catch { /* Diagnostics must not change upload semantics. */ }
  try { return await action(); }
  finally {
    try {
      if (start !== undefined && timing) {
        const name = 'buildr.attachment.' + stage;
        timing.clearMeasures(name);
        timing.measure(name, { start, end: timing.now() });
      }
    } catch { /* Unsupported or disabled diagnostics never mask the upload result. */ }
  }
}
