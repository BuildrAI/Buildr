#!/usr/bin/env node

import { checkRuntimeAdapter, printRuntimeAdapterCheckReport } from './check-runtime.ts';
import { repairCommands } from './projection.ts';

export function claudeCodeRepairCommands(result: any): any  { return repairCommands(result, 'claude-code'); }
export function printRuntimeCheckReport(result: any): any  { printRuntimeAdapterCheckReport(result); }

export function checkClaudeCodeRuntime(argv: any, options: any = {}): any  {
  return checkRuntimeAdapter(argv, { ...options, adapterId: 'claude-code', command: options.command ?? 'buildr runtime check claude-code' });
}
