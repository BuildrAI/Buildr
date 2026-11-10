#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Require an explicit service root: installed Skills cannot assume a source checkout.
const args = process.argv.slice(2);
const index = args.indexOf('--root');
if (index < 0 || !args[index + 1] || args[index + 1].startsWith('-')) {
  console.error('Usage: node verify-impact.mjs --root <buildr-service-root> --base <integration-ref> [--tag <tag>] [--failed-from <timing.json>] [--plan|--json]');
  process.exit(2);
}
const root = fs.realpathSync(path.resolve(args[index + 1]));
args.splice(index, 2);
if (!args.includes('--base')) { console.error('Delivery verification requires --base <integration-ref>.'); process.exit(2); }
const cli = path.join(root, 'test/verification/cli.ts');
const preload = path.join(root, 'test/register-development-entry.ts');
if (!fs.existsSync(cli) || !fs.existsSync(preload)) { console.error('The selected root does not provide the Buildr source verification framework.'); process.exit(2); }
const result = spawnSync(process.execPath, ['--import', preload, cli, 'related', '--semantic', ...args], { cwd: root, env: process.env, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
