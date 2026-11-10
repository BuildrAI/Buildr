import path from 'node:path';

export interface VerificationRecipeRoots {
  repositoryRoot: string;
  nodeExecutable?: string;
}

/** Executable locations and checkout paths describe an invocation environment,
 * not the source recipe. Normalize only path-bearing command fields so a Node
 * patch upgrade or a different checkout root cannot replace a valid proof. */
function portableCommandPath(value: unknown, roots: VerificationRecipeRoots): unknown {
  if (typeof value !== 'string' || value === 'node') return value;
  const nodeExecutable = roots.nodeExecutable ?? process.execPath;
  if (value === nodeExecutable) return 'node';
  if (!path.isAbsolute(value)) return value;
  const repositoryRoot = path.resolve(roots.repositoryRoot);
  const relative = path.relative(repositoryRoot, path.resolve(value));
  if (relative === '') return '.';
  if (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join('/');
  }
  return value;
}

function portableCommand(command: any, roots: VerificationRecipeRoots): any {
  if (!command || typeof command !== 'object' || Array.isArray(command)) return command;
  return {
    ...command,
    ...(typeof command.file === 'string' ? { file: portableCommandPath(command.file, roots) } : {}),
    ...(typeof command.cwd === 'string' ? { cwd: portableCommandPath(command.cwd, roots) } : {}),
    ...(Array.isArray(command.args) ? { args: command.args.map((value: unknown) => portableCommandPath(value, roots)) } : {}),
  };
}

export function portableVerificationExecutor(executor: any, roots: VerificationRecipeRoots): any {
  return portableCommand(executor, roots);
}

export function portableVerificationPreparations(preparations: any[] | undefined, roots: VerificationRecipeRoots): any[] {
  return (preparations ?? []).map(preparation => portableCommand(preparation, roots));
}
