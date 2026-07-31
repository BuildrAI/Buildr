import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { registerTaskFinishApplication } from '../../application/task-finish/task-finish-application.mjs';

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}

function withResolvedTarget(args) {
  const nextArgs = [...args];
  const targetRoot = path.resolve(optionValue(nextArgs, '--target', process.cwd()));
  const targetIndex = nextArgs.indexOf('--target');
  if (targetIndex === -1) nextArgs.push('--target', targetRoot);
  else nextArgs[targetIndex + 1] = targetRoot;
  return { args: nextArgs, targetRoot };
}

function atomicWriteFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, file);
}

export function isLightweightTaskFinishCommand(argv = process.argv) {
  const args = argv.slice(2);
  return !args.some((arg) => arg === '--help' || arg === '-h')
    && args[0] === 'task' && args[1] === 'finish' && args[2] === 'inspect';
}

export async function runLightweightTaskFinish(argv = process.argv) {
  const action = argv[4];
  if (action !== 'inspect') throw new Error(`Unsupported lightweight Task Finish action: ${action || '<missing>'}`);
  const runtime = { optionValue, withResolvedTarget, atomicWriteFile };
  registerTaskFinishApplication(runtime);
  return await runtime.taskFinish(action, argv.slice(5));
}
