import type { AgentExecutor } from '../contracts.ts';
import { createCodexExecutor } from './codex/index.ts';
import { createDshExecutor } from './dsh/index.ts';
import { createQoderExecutor } from './qoder/index.ts';
export { createCodexExecutor, createDshExecutor, createQoderExecutor };
/** Only real, explicitly supported providers are installed. */
export function createNativeExecutors(): AgentExecutor[] { return [createCodexExecutor(), createDshExecutor(), createQoderExecutor()]; }
