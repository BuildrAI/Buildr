#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { parseInstallClaudeCodeBuildrSkillArgs, parseRenderClaudeCodeArgs } from './skills/arguments.ts';
import { ensureDirectory, resolveSkillScope } from './skills/primitives.ts';
import { resolveSkillContributions } from './skills/contributions.ts';
import { resolvePackageAgentSkill, resolveSkills } from './skills/sources.ts';
import { applySkillRenderPlan, buildRuntimeSkillTarget, buildSkillRenderPlan, buildSkillTarget, buildSkillContent, buildAgentInstallPlanContent, buildAgentInstallPlanTarget, hasManagedSkillMarker, resolveRenderSkills } from './skills/render-plan.ts';

export { parseInstallClaudeCodeBuildrSkillArgs, parseRenderClaudeCodeArgs } from './skills/arguments.ts';
export { resolveSkillScope } from './skills/primitives.ts';
export { resolveSkillContributions } from './skills/contributions.ts';
export { resolvePackageAgentSkill, resolveSkills } from './skills/sources.ts';
export { applySkillRenderPlan, buildRuntimeSkillTarget, buildSkillRenderPlan, buildSkillTarget, buildSkillContent, buildAgentInstallPlanContent, buildAgentInstallPlanTarget, hasManagedSkillMarker, resolveRenderSkills } from './skills/render-plan.ts';

function renderSkill(repoRoot: any, targetRoot: any, skill: any, runtime: any = 'claude-code'): any  {
  const target = skill.installMode === 'agent'
    ? buildAgentInstallPlanTarget(targetRoot, skill, runtime)
    : buildRuntimeSkillTarget(targetRoot, skill, runtime);
  applySkillRenderPlan(buildSkillRenderPlan(repoRoot, targetRoot, [skill], runtime), targetRoot);
  return target;
}

export function renderClaudeCode(argv: any, options: any = {}): any  {
  const repoRoot = options.repoRoot ?? process.cwd();
  const command = options.command ?? 'node src/agent-assets/infrastructure/runtime/render-claude-code.mjs';
  const args = parseRenderClaudeCodeArgs(argv, command);
  const targetRoot = path.resolve(repoRoot, args.target);
  ensureDirectory(targetRoot, `Target directory does not exist: ${targetRoot}`);
  const skills = resolveRenderSkills(repoRoot, args.scope, 'claude-code');
  const plan = buildSkillRenderPlan(repoRoot, targetRoot, skills, 'claude-code');
  return { targetRoot, files: options.planOnly ? [] : applySkillRenderPlan(plan, targetRoot), plan };
}

export function installClaudeCodeBuildrSkill(argv: any, options: any = {}): any  {
  const repoRoot = options.repoRoot ?? process.cwd();
  const command = options.command ?? 'node src/agent-assets/infrastructure/runtime/render-claude-code.mjs install';
  const args = parseInstallClaudeCodeBuildrSkillArgs(argv, command);
  const targetRoot = path.resolve(repoRoot, args.target);
  ensureDirectory(targetRoot, `Target directory does not exist: ${targetRoot}`);

  const skill = resolvePackageAgentSkill('claude-code', 'buildr');
  const files: any[] = [renderSkill(repoRoot, targetRoot, skill)];
  return { targetRoot, files };
}
