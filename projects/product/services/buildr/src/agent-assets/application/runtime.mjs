import path from 'node:path';
import process from 'node:process';
import { parseInstallClaudeCodeBuildrSkillArgs } from '../infrastructure/runtime/render-claude-code.mjs';
import { assembleRuntimeProjection } from '../infrastructure/runtime/projection.mjs';
import { RUNTIME_CHECKERS, RUNTIME_CHECK_PRINTERS } from '../infrastructure/runtime/check-runtime.mjs';
import {
  RUNTIME_ADAPTERS,
  SUPPORTED_AGENT_IDS,
  UNSUPPORTED_AGENT_GUIDANCE,
  reconcileRuntimePlan,
  runtimeDiscoveryPayload,
  selectAdapterImplementation,
} from '../infrastructure/runtime/adapter-contract.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../infrastructure/contracts/public-json.mjs';

export function registerDomainsRuntime(runtime) {
  const assertNoUnknownOptions = (...args) => runtime.assertNoUnknownOptions(...args);
  const isValidAssetId = (...args) => runtime.isValidAssetId(...args);
  const hasFlag = (...args) => runtime.hasFlag(...args);
  const existsDirectory = (...args) => runtime.existsDirectory(...args);

  function assertName(value, label) {
    if (!isValidAssetId(value)) {
      throw new Error(`${label} must contain only letters, digits, dots, underscores, or dashes: ${value || ''}`);
    }
  }

  function assertAgentId(value) {
    if (!isValidAssetId(value)) {
      throw new Error(`Agent id must contain only letters, digits, dots, underscores, or dashes: ${value || ''}`);
    }
  }

  function runtimeList(args) {
    assertNoUnknownOptions(args, new Set(['--json']));
    const json = hasFlag(args, '--json');
    const payload = runtimeDiscoveryPayload();
    if (json) {
      process.stdout.write(`${JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.runtimeList, payload), null, 2)}\n`);
      return;
    }

    console.log('Buildr supported Agent runtime adapters');
    console.log('');
    for (const agent of SUPPORTED_AGENT_IDS) {
      const adapter = RUNTIME_ADAPTERS[agent];
      const rulesEntry = adapter.renderCapabilities['rules-entry'];
      console.log(`- ${adapter.id} (${adapter.displayName})`);
      console.log(`  render targets: ${adapter.runtimeTargets.join(', ')}`);
      console.log(`  rules: ${rulesEntry.projection.mode}; ${rulesEntry.sourceDiscovery.mode} ${rulesEntry.sourceDiscovery.pattern}; includes ancestors: ${rulesEntry.sourceDiscovery.includesAncestors}`);
      console.log(`  sync: ${adapter.recommendedCommands.syncWorkspaceEntry}`);
      console.log(`  render: ${adapter.recommendedCommands.renderScope}`);
      console.log(`  skills render: ${adapter.recommendedCommands.renderSkillsScope}`);
      console.log(`  skill install: ${adapter.recommendedCommands.installProductSkill}`);
      console.log(`  runtime check: ${adapter.recommendedCommands.runtimeCheckScope}`);
    }
    console.log('');
    console.log(`Unsupported Agent: ${UNSUPPORTED_AGENT_GUIDANCE.message}${UNSUPPORTED_AGENT_GUIDANCE.nextStep}`);
  }

  function runtimeImplementation(adapter, kind, implementations) {
    return selectAdapterImplementation(adapter, kind, implementations);
  }

  function installProductRuntimeSkill(agent, args, options = {}) {
    const repoRoot = options.repoRoot ?? process.cwd();
    const command = options.command ?? `buildr skill install ${agent}`;
    const parsed = parseInstallClaudeCodeBuildrSkillArgs(args, command);
    const targetRoot = path.resolve(repoRoot, parsed.target);
    if (!existsDirectory(targetRoot)) throw new Error(`Target directory does not exist: ${targetRoot}`);
    const { plan } = assembleRuntimeProjection({ repoRoot, targetRoot, scope: '.', adapterId: agent, selection: { productSkill: true } });
    reconcileRuntimePlan(plan);
    return { targetRoot, files: plan.writes.map((item) => item.targetFile), plan };
  }

  Object.assign(runtime, {
    assertName,
    assertAgentId,
    runtimeList,
    runtimeImplementation,
    installProductRuntimeSkill,
    RUNTIME_CHECKERS,
    RUNTIME_CHECK_PRINTERS,
  });
  return runtime;
}
