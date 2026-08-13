#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { parseInstallClaudeCodeBuildrSkillArgs, parseRenderClaudeCodeArgs } from './skills/arguments.mjs';
import { ensureDirectory, resolveSkillScope } from './skills/primitives.mjs';
import { resolveSkillContributions } from './skills/contributions.mjs';
import { resolvePackageAgentSkill, resolveSkills } from './skills/sources.mjs';
import { applySkillRenderPlan, buildRuntimeSkillTarget, buildSkillRenderPlan, buildSkillTarget, buildSkillContent, buildAgentInstallPlanContent, buildAgentInstallPlanTarget, hasManagedSkillMarker, resolveRenderSkills } from './skills/render-plan.mjs';

export { parseInstallClaudeCodeBuildrSkillArgs, parseRenderClaudeCodeArgs } from './skills/arguments.mjs';
export { resolveSkillScope } from './skills/primitives.mjs';
export { resolveSkillContributions } from './skills/contributions.mjs';
export { resolvePackageAgentSkill, resolveSkills } from './skills/sources.mjs';
export { applySkillRenderPlan, buildRuntimeSkillTarget, buildSkillRenderPlan, buildSkillTarget, buildSkillContent, buildAgentInstallPlanContent, buildAgentInstallPlanTarget, hasManagedSkillMarker, resolveRenderSkills } from './skills/render-plan.mjs';

function renderSkill(repoRoot, targetRoot, skill, runtime = 'claude-code') {
  const target = skill.installMode === 'agent'
    ? buildAgentInstallPlanTarget(targetRoot, skill, runtime)
    : buildRuntimeSkillTarget(targetRoot, skill, runtime);
  applySkillRenderPlan(buildSkillRenderPlan(repoRoot, targetRoot, [skill], runtime), targetRoot);
  return target;
}

export function renderClaudeCode(argv, options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const command = options.command ?? 'node src/infrastructure/runtime/render-claude-code.mjs';
  const args = parseRenderClaudeCodeArgs(argv, command);
  const targetRoot = path.resolve(repoRoot, args.target);
  ensureDirectory(targetRoot, `Target directory does not exist: ${targetRoot}`);
  const skills = resolveRenderSkills(repoRoot, args.scope, 'claude-code');
  const plan = buildSkillRenderPlan(repoRoot, targetRoot, skills, 'claude-code');
  return { targetRoot, files: options.planOnly ? [] : applySkillRenderPlan(plan, targetRoot), plan };
}

export function installClaudeCodeBuildrSkill(argv, options = {}) {
  const repoRoot = options.repoRoot ?? process.cwd();
  const command = options.command ?? 'node src/infrastructure/runtime/render-claude-code.mjs install';
  const args = parseInstallClaudeCodeBuildrSkillArgs(argv, command);
  const targetRoot = path.resolve(repoRoot, args.target);
  ensureDirectory(targetRoot, `Target directory does not exist: ${targetRoot}`);

  const skill = resolvePackageAgentSkill('claude-code', 'buildr');
  const files = [renderSkill(repoRoot, targetRoot, skill)];
  return { targetRoot, files };
}
