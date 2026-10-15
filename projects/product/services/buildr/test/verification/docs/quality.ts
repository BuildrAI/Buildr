#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { isTaskRecordId } from '../../../src/modules/task/domain/task.ts';

const serviceRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const projectRoot: any = path.resolve(serviceRoot, '../..');
const repositoryRoot: any = path.resolve(projectRoot, '../..');
export function documentationLinkProblem(file: string, rawTarget: string, root: string = repositoryRoot): string | null {
  let target = rawTarget.trim().replace(/^<|>$/g, '');
  if (!target || /^(?:https?:|mailto:|#)/.test(target)) return null;
  if (target.startsWith('@task/')) {
    return isTaskRecordId(target.slice('@task/'.length)) ? null : `invalid task reference: ${rawTarget}`;
  }
  target = target.split('#')[0].split('?')[0];
  if (!target) return null;
  const resolved = path.resolve(path.dirname(file), decodeURIComponent(target));
  if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) return `link escapes repository root: ${rawTarget}`;
  if (!fs.existsSync(resolved)) return `missing relative link: ${rawTarget}`;
  return null;
}

function main(): void {
  const explicit: any = process.env.BUILDR_CHANGED_PATHS_JSON ? JSON.parse(process.env.BUILDR_CHANGED_PATHS_JSON) : [];
  const files: any[] = [];

  function visit(target: any): any  {
    if (!fs.existsSync(target)) return;
    const stat: any = fs.statSync(target);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
        if (['node_modules', '.git', 'archive'].includes(entry.name)) continue;
        visit(path.join(target, entry.name));
      }
    } else if (/\.(?:md|html)$/.test(target)) files.push(target);
  }

  if (explicit.length > 0) {
    for (const relative of explicit) {
      visit(path.join(projectRoot, relative));
    }
  } else {
    for (const entry of ['README.md', 'README.en.md', 'CONTRIBUTING.md', 'SECURITY.md', 'docs']) visit(path.join(repositoryRoot, entry));
    for (const entry of ['README.md', 'docs']) visit(path.join(serviceRoot, entry));
    for (const entry of ['README.md', 'docs', 'knowledge', 'openspec']) visit(path.join(projectRoot, entry));
  }

  const problems: any[] = [];
  for (const file of [...new Set(files)].sort()) {
    const relative: any = path.relative(projectRoot, file).split(path.sep).join('/');
    const content: any = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.md')) {
      const linkContent: any = content.replace(/`+[^`\n]*`+/g, '');
      for (const match of linkContent.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        const problem = documentationLinkProblem(file, match[1]);
        if (problem) problems.push(`${relative}: ${problem}`);
      }
    }
  }

  if (problems.length > 0) {
    process.stderr.write(`Documentation quality failed:\n${problems.map((item: any) => `- ${item}`).join('\n')}\n`);
    process.exitCode = 1;
  } else process.stdout.write(`Documentation quality passed: ${files.length} file(s).\n`);
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) main();
