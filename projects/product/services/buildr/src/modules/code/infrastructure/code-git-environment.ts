const configurationSelectors = new Set(['GIT_CONFIG_SYSTEM', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM']);

/** Keep explicit configuration selection while isolating repository identity and injected Git options. */
export function codeGitEnvironment(inherited: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const environment = Object.fromEntries(Object.entries(inherited).filter(([name]) => !name.toUpperCase().startsWith('GIT_') || configurationSelectors.has(name.toUpperCase())).map(([name, value]) => [name.toUpperCase().startsWith('GIT_') ? name.toUpperCase() : name, value]));
  return { ...environment, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: '0', GIT_NO_LAZY_FETCH: '1' };
}
