import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { AGENT_EXECUTION_CONTRACTS } from '../src/execution-contracts.ts';
import { CONVERSATION_SCHEMA_VERSION } from '../src/persistence/conversation-repository.ts';

const root = path.resolve(import.meta.dirname, '..');

export function buildAgentService(serviceRoot = root): string {
  const compilerPackage = createRequire(path.join(serviceRoot, 'package.json')).resolve('typescript/package.json');
  const compilerMetadata = JSON.parse(fs.readFileSync(compilerPackage, 'utf8'));
  const compiler = path.resolve(path.dirname(compilerPackage), compilerMetadata.bin.tsc);
  fs.rmSync(path.join(serviceRoot, 'build'), { recursive: true, force: true });
  const result = spawnSync(process.execPath, [compiler, '--project', path.join(serviceRoot, 'tsconfig.json')], {
    cwd: serviceRoot, stdio: 'inherit', env: { ...process.env, PATH: [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter) },
  });
  if (result.error || result.status !== 0) throw new Error(`agent_build_failed: ${result.error?.message ?? result.signal ?? result.status}`);
  if (!fs.statSync(path.join(serviceRoot, 'build/index.js'), { throwIfNoEntry: false })?.isFile()) throw new Error('agent_public_entry_missing');
  fs.writeFileSync(path.join(serviceRoot, 'build/runtime-contracts.json'), JSON.stringify({ contracts: AGENT_EXECUTION_CONTRACTS, storageVersion: CONVERSATION_SCHEMA_VERSION }) + '\n');
  const notice = path.join(serviceRoot, 'src/model-access/providers/THIRD_PARTY_NOTICES.md');
  if (fs.existsSync(notice)) fs.copyFileSync(notice, path.join(serviceRoot, 'build/THIRD_PARTY_NOTICES.md'));
  return path.join(serviceRoot, 'build');
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(import.meta.filename)) buildAgentService();
