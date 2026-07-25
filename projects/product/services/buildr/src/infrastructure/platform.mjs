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
  LEGACY_PACKAGE_PATHS,
  PACKAGE_BOOTSTRAP_CONTRACT,
  PACKAGE_RUNTIME_TARGET,
  PACKAGE_WORKSPACE_TARGET,
} from './product-layout.mjs';
const OPENSPEC_CONTRACT_BASELINE_SCHEMA = 'buildr.openspec-contract-baseline/v1';
const OPENSPEC_CONTRACT_RECEIPT_SCHEMA = 'buildr.openspec-contract-receipt/v1';
const OPENSPEC_CONTRACT_SUPPORTED_UPSTREAM_VERSIONS = new Set(['1.6.0']);

export {
  fs, crypto, os, path, process, fileURLToPath, execFileSync, spawnSync, YAML,
  checkClaudeCodeRuntime, printRuntimeCheckReport,
  hasManagedSkillMarker, parseInstallClaudeCodeBuildrSkillArgs,
  buildRuleDiscoveryPlan, hasManagedRulesMarker, renderClaudeCodeRules, resolveRuleScope,
  checkCodexRuntime, printCodexRuntimeCheckReport, assembleRuntimeProjection,
  RUNTIME_ADAPTERS, SUPPORTED_AGENT_IDS, UNSUPPORTED_AGENT_GUIDANCE,
  getRuntimeAdapter, isSupportedAgent, reconcileRuntimePlan, runtimeDiscoveryPayload, selectAdapterImplementation,
  PACKAGE_WORKSPACE_TARGET, PACKAGE_RUNTIME_TARGET, PACKAGE_BOOTSTRAP_CONTRACT,
  LEGACY_PACKAGE_PATHS, OPENSPEC_CONTRACT_BASELINE_SCHEMA,
  OPENSPEC_CONTRACT_RECEIPT_SCHEMA, OPENSPEC_CONTRACT_SUPPORTED_UPSTREAM_VERSIONS,
  RUNTIME_CHECKERS, RUNTIME_CHECK_PRINTERS,
  BUILDR_REQUIRED_BLOCK_START,
};
