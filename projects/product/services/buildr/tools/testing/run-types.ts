import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const require = createRequire(path.resolve('package.json'));
const metadataPath = require.resolve('typescript/package.json');
const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
const compiler = path.resolve(path.dirname(metadataPath), metadata.bin.tsc);
const result = spawnSync(process.execPath, [compiler, ...process.argv.slice(2)], { cwd: process.cwd(), env: process.env, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
