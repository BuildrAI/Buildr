#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const projectRoot = path.resolve(serviceRoot, '../..');
const explicit = process.env.BUILDR_CHANGED_PATHS_JSON ? JSON.parse(process.env.BUILDR_CHANGED_PATHS_JSON) : [];
const files = [];

function visit(target) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
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
  for (const entry of ['README.md', 'docs', 'package/README.md']) visit(path.join(serviceRoot, entry));
  for (const entry of ['README.md', 'docs', 'openspec']) visit(path.join(projectRoot, entry));
}

const problems = [];
for (const file of [...new Set(files)].sort()) {
  const relative = path.relative(projectRoot, file).split(path.sep).join('/');
  const content = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.md')) {
    const linkContent = content.replace(/`+[^`\n]*`+/g, '');
    for (const match of linkContent.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      let target = match[1].trim().replace(/^<|>$/g, '');
      if (!target || /^(?:https?:|mailto:|#)/.test(target)) continue;
      target = target.split('#')[0].split('?')[0];
      if (!target) continue;
      const resolved = path.resolve(path.dirname(file), decodeURIComponent(target));
      if (!resolved.startsWith(`${projectRoot}${path.sep}`) && resolved !== projectRoot) problems.push(`${relative}: link escapes Product Project root: ${match[1]}`);
      else if (!fs.existsSync(resolved)) problems.push(`${relative}: missing relative link: ${match[1]}`);
    }
  }
}

if (problems.length > 0) {
  process.stderr.write(`Documentation quality failed:\n${problems.map((item) => `- ${item}`).join('\n')}\n`);
  process.exitCode = 1;
} else process.stdout.write(`Documentation quality passed: ${files.length} file(s).\n`);
