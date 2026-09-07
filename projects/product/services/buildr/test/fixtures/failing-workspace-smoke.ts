import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

fs.mkdirSync(process.env.BUILDR_SMOKE_WORKSPACE_ROOT, { recursive: true });
fs.writeFileSync(path.join(process.env.BUILDR_SMOKE_WORKSPACE_ROOT, 'partial-smoke-state'), 'must be cleaned\n');
process.exitCode = 23;
