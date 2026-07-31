const stripProductPrefix = (value) => String(value || '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/^projects\/product\//, '');

export function classifyRetainedConvergencePaths(paths = []) {
  const result = { runtime: [], cli: [], localApp: [], unknown: [] };
  const normalized = [...new Set(paths.map(stripProductPrefix).filter(Boolean))].sort();
  const runtimePattern = /^(?:rules\/|skills\/|components\/|commands\/|capabilities\.yml$|commands\.yml$|services\/buildr\/package\/targets\/workspace\/|services\/buildr\/package\/manifest\.yml$)/;
  const cliPattern = /^(?:buildr$|services\/buildr\/(?:bin\/|src\/.*\.mjs$|scripts\/(?:install|uninstall)-buildr-cli$|package\.json$|package-lock\.json$))/;
  const localAppPattern = /^services\/buildr\/(?:src\/interfaces\/local-app\/(?:runtime|http)\/|src\/application\/local-app|scripts\/(?:install|uninstall)-local-app)/;
  for (const candidate of normalized) {
    let matched = false;
    if (runtimePattern.test(candidate)) { result.runtime.push(candidate); matched = true; }
    if (cliPattern.test(candidate)) { result.cli.push(candidate); matched = true; }
    if (localAppPattern.test(candidate)) { result.localApp.push(candidate); matched = true; }
    if (!matched) result.unknown.push(candidate);
  }
  return { ...result, requiresRuntimeSync: result.runtime.length > 0, requiresCliInstall: result.cli.length > 0, requiresLocalAppInstall: result.localApp.length > 0 };
}
