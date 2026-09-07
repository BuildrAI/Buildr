#!/usr/bin/env node

import { checkRuntimeAdapter, printRuntimeAdapterCheckReport } from './check-runtime.ts';
import { repairCommands } from './projection.ts';

export function codexRepairCommands(result: any): any  { return repairCommands(result, 'codex'); }
export function printCodexRuntimeCheckReport(result: any): any  { printRuntimeAdapterCheckReport(result); }

export function checkCodexRuntime(argv: any, options: any = {}): any  {
  return checkRuntimeAdapter(argv, { ...options, adapterId: 'codex', command: options.command ?? 'buildr runtime check codex' });
}
