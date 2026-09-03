function usage(command: any = 'node src/agent-assets/infrastructure/runtime/render-claude-code.mjs'): any  {
  console.error(`Usage: ${command} --scope <.|projects/project> --target <dir>`);
}

function installUsage(command: any = 'node src/agent-assets/infrastructure/runtime/render-claude-code.mjs install'): any  {
  console.error(`Usage: ${command} --target <dir>`);
}

export function parseRenderClaudeCodeArgs(argv: any, command: any): any  {
  const args: Record<string, any> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--scope' || arg === '--target') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`);
      }
      args[arg.slice(2)] = value;
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.scope || !args.target) {
    usage(command);
    throw new Error('Missing required arguments');
  }
  return args;
}

export function parseInstallClaudeCodeBuildrSkillArgs(argv: any, command: any): any  {
  const args: Record<string, any> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--target') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`);
      }
      args[arg.slice(2)] = value;
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.target) {
    installUsage(command);
    throw new Error('Missing required arguments');
  }
  return args;
}
