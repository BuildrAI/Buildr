import process from 'node:process';
export function currentProductInvocation(options = {}) {
  const env = options.env ?? process.env;
  const argv = options.argv ?? process.argv;
  const explicitCliPath = options.cliPath || env.BUILDR_NPM_ENTRY_PATH || null;
  const cliPath = explicitCliPath || argv[1];
  if (!cliPath) throw new Error('Host/development Buildr invocation requires an explicit CLI entry path.');
  const portableCliPath = String(cliPath).replaceAll('\\', '/');
  if (!explicitCliPath && (/(?:^|\/)test(?:\/|$)/u.test(portableCliPath) || /\.test\.mjs$/u.test(portableCliPath))) {
    throw new Error('Host/development Buildr invocation cannot infer a Node test entry; pass the delivered bin/buildr.mjs explicitly.');
  }
  return Object.freeze({ command: process.execPath, argsPrefix: [cliPath], kind: options.kind || 'host-node' });
}

export function productInvocationArgs(invocation, args) {
  if (!invocation?.command || !Array.isArray(invocation.argsPrefix)) throw new Error('Invalid Buildr product invocation.');
  return [invocation.command, [...invocation.argsPrefix, ...args]];
}

export function registerProductInvocation(runtime) {
  Object.assign(runtime, { currentProductInvocation, productInvocationArgs });
  return runtime;
}
