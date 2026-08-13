#!/usr/bin/env node

import { checkRuntimeAdapter, printRuntimeAdapterCheckReport } from './check-runtime.mjs';
import { repairCommands } from './projection.mjs';

export function claudeCodeRepairCommands(result) { return repairCommands(result, 'claude-code'); }
export function printRuntimeCheckReport(result) { printRuntimeAdapterCheckReport(result); }

export function checkClaudeCodeRuntime(argv, options = {}) {
  return checkRuntimeAdapter(argv, { ...options, adapterId: 'claude-code', command: options.command ?? 'buildr runtime check claude-code' });
}
