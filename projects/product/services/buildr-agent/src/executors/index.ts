import type { NativeToolContent } from '../native-content-contracts.ts';
import {readCodexTool} from './codex/content.ts';
import {readDshTool} from './dsh/content.ts';
import {readQoderTool} from './qoder/content.ts';
import type { AgentExecutor } from '../contracts.ts';
import { createCodexExecutor } from './codex/index.ts';
import { createDshExecutor } from './dsh/index.ts';
import { createQoderExecutor } from './qoder/index.ts';
export { createCodexExecutor, createDshExecutor, createQoderExecutor };
/** Only real, explicitly supported providers are installed. */
export function createNativeExecutors(): AgentExecutor[] { return [createCodexExecutor(), createDshExecutor(), createQoderExecutor()]; }

/** Each provider owns its native record format and detail projection. */
export function readNativeTool(root:string,reference:NativeToolContent) {
  if(reference.provider==='codex')return readCodexTool(root,reference);
  if(reference.provider==='dsh')return readDshTool(root,reference);
  if(reference.provider==='qoder')return readQoderTool(root,reference);
}
