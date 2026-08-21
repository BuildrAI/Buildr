import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from './process.mjs';
import YAML from 'yaml';
import { checkClaudeCodeRuntime, printRuntimeCheckReport } from './runtime/check-claude-code.mjs';
import { RUNTIME_CHECKERS, RUNTIME_CHECK_PRINTERS } from './runtime/check-runtime.mjs';
import { hasManagedSkillMarker, parseInstallClaudeCodeBuildrSkillArgs } from './runtime/render-claude-code.mjs';
import { buildRuleDiscoveryPlan, hasManagedRulesMarker, renderClaudeCodeRules, resolveRuleScope } from './runtime/render-claude-code-rules.mjs';
import { checkCodexRuntime, printCodexRuntimeCheckReport } from './runtime/check-codex.mjs';
import { assembleRuntimeProjection } from './runtime/projection.mjs';
import {
  RUNTIME_ADAPTERS,
  SUPPORTED_AGENT_IDS,
  UNSUPPORTED_AGENT_GUIDANCE,
  getRuntimeAdapter,
  isSupportedAgent,
  reconcileRuntimePlan,
  runtimeDiscoveryPayload,
  selectAdapterImplementation,
} from './runtime/adapter-contract.mjs';
import {
  BUILDR_REQUIRED_BLOCK_START,
  BOOTSTRAP_CONTRACT_RESOURCE,
  LEGACY_PACKAGE_PATHS,
  PACKAGE_RUNTIME_TARGET,
  RESOURCE_WORKSPACE_ROOT,
} from './product-layout.mjs';

export {
  fs, crypto, os, path, process, fileURLToPath, execFileSync, spawnSync, YAML,
  checkClaudeCodeRuntime, printRuntimeCheckReport,
  hasManagedSkillMarker, parseInstallClaudeCodeBuildrSkillArgs,
  buildRuleDiscoveryPlan, hasManagedRulesMarker, renderClaudeCodeRules, resolveRuleScope,
  checkCodexRuntime, printCodexRuntimeCheckReport, assembleRuntimeProjection,
  RUNTIME_ADAPTERS, SUPPORTED_AGENT_IDS, UNSUPPORTED_AGENT_GUIDANCE,
  getRuntimeAdapter, isSupportedAgent, reconcileRuntimePlan, runtimeDiscoveryPayload, selectAdapterImplementation,
  RESOURCE_WORKSPACE_ROOT, PACKAGE_RUNTIME_TARGET, BOOTSTRAP_CONTRACT_RESOURCE,
  LEGACY_PACKAGE_PATHS,
  RUNTIME_CHECKERS, RUNTIME_CHECK_PRINTERS,
  BUILDR_REQUIRED_BLOCK_START,
};
