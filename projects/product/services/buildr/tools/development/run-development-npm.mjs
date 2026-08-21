import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const requiredNodeVersion = fs.readFileSync(path.resolve(serviceRoot, '../../.node-version'), 'utf8').trim();
const actualNodeVersion = process.versions.node;
if (actualNodeVersion !== requiredNodeVersion) {
  console.error(`Buildr Product requires Node ${requiredNodeVersion}; active Node is ${actualNodeVersion}.`);
  process.exit(1);
}

const nodeRoot = path.dirname(process.execPath);
const npmCandidates = process.platform === 'win32'
  ? [
      path.join(nodeRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      path.resolve(nodeRoot, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ]
  : [
      path.resolve(nodeRoot, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
      path.join(nodeRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    ];
const npmCli = npmCandidates.find((candidate) => fs.existsSync(candidate));
if (!npmCli) {
  console.error(`Exact Buildr Product Node does not provide its adjacent npm CLI: ${npmCandidates.join(', ')}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, [npmCli, ...process.argv.slice(2)], {
  env: { ...process.env, PATH: [nodeRoot, process.env.PATH].filter(Boolean).join(path.delimiter) },
  stdio: 'inherit',
});
if (result.error) {
  console.error(result.error.stack || result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
