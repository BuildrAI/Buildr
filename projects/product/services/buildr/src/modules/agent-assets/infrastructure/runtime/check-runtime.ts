import path from 'node:path';
import process from 'node:process';
import { getRuntimeAdapter } from './adapter-contract.ts';
import { checkRuntimeProjection, printRuntimeProjectionReport, resolveRuntimeProjectionSelection } from './projection.ts';
import { parseRenderClaudeCodeArgs } from './render-claude-code.ts';

export function checkRuntimeAdapter(argv: any, options: any = {}): any  {
  const selection = resolveRuntimeProjectionSelection(options);
  const { adapter, runtimeId } = selection;
  const repoRoot = options.repoRoot ?? process.cwd();
  const args = parseRenderClaudeCodeArgs(argv, options.command ?? `buildr runtime check ${adapter.id}`);
  const result = checkRuntimeProjection({ repoRoot, targetRoot: path.resolve(repoRoot, args.target), scope: args.scope, adapterId: adapter.id, runtimeId });
  return {
    ...result,
    activation: selection.host.activation ?? adapter.traits.activation,
  };
}

export function printRuntimeAdapterCheckReport(result: any): any  {
  printRuntimeProjectionReport(result, getRuntimeAdapter(result.adapterId).displayName);
  console.log(`Activation: rules=${result.activation.rules} skills=${result.activation.skills}`);
  if (result.activation.reloadGuidance) console.log(`Reload: ${result.activation.reloadGuidance}`);
  console.log(`Runtime source: ${result.runtimeSourceEvidence.sourceRoot}`);
  console.log(`Projection identity: ${result.runtimeSourceEvidence.projectionIdentity}`);
  console.log(`Session consumption: ${result.runtimeSourceEvidence.sessionConsumption}`);
}

export const RUNTIME_CHECKERS = Object.freeze({ projection: checkRuntimeAdapter });
export const RUNTIME_CHECK_PRINTERS = Object.freeze({ projection: printRuntimeAdapterCheckReport });
