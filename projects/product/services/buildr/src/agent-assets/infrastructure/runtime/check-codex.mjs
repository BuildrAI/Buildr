#!/usr/bin/env node

import { checkRuntimeAdapter, printRuntimeAdapterCheckReport } from './check-runtime.mjs';
import { repairCommands } from './projection.mjs';

export function codexRepairCommands(result) { return repairCommands(result, 'codex'); }
export function printCodexRuntimeCheckReport(result) { printRuntimeAdapterCheckReport(result); }

export function checkCodexRuntime(argv, options = {}) {
  return checkRuntimeAdapter(argv, { ...options, adapterId: 'codex', command: options.command ?? 'buildr runtime check codex' });
}
