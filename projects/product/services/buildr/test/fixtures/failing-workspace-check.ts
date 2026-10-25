import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const workspaceRoot = process.env.BUILDR_SMOKE_WORKSPACE_ROOT;
if (!workspaceRoot) throw new Error('Missing fixture workspace root');
fs.mkdirSync(workspaceRoot, { recursive: true });
fs.writeFileSync(path.join(workspaceRoot, 'partial-smoke-state'), 'must be cleaned\n');
process.exitCode = 23;
