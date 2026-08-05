function rootHelp(catalog) {
  const headings = {
    primary: 'Primary workspace commands:',
    'agent-machine': 'Agent machine commands:',
    maintenance: 'Product maintenance commands:',
    legacy: 'Legacy compatibility commands:',
  };
  const lines = ['Usage: buildr <command> [options]'];
  for (const surface of Object.keys(headings)) {
    const commands = catalog.filter((item) => item.executable && item.surface === surface);
    if (commands.length === 0) continue;
    lines.push('', headings[surface]);
    for (const item of commands) {
      const replacement = item.replacement ? ` Replacement: ${item.replacement}.` : '';
      lines.push(`  ${item.key.padEnd(32)}${item.summary}${replacement}`);
    }
  }
  lines.push('', 'Surface 只控制发现层级与兼容承诺，不改变命令自身的授权、安全契约或 effects。');
  return lines;
}

export function registerCommandHelp(runtime, catalog) {
  function commandTopic(rawArgs) {
    const words = rawArgs.filter((arg) => !['--help', '-h'].includes(arg));
    if (words[0] === 'help') words.shift();
    if (words.length === 0) return 'root';
    return catalog
      .filter((item) => item.help && item.key.split(' ').every((token, index) => words[index] === token))
      .sort((left, right) => right.key.split(' ').length - left.key.split(' ').length)[0]?.key || null;
  }

  function printHelp(rawArgs) {
    const topic = commandTopic(rawArgs);
    if (!topic) return false;
    const descriptor = topic === 'root' ? null : catalog.find((item) => item.key === topic);
    const lines = topic === 'root' ? rootHelp(catalog) : descriptor.help;
    console.log(lines.join('\n'));
    return true;
  }

  function usage() {
    console.error(rootHelp(catalog).join('\n'));
  }

  function isHelpRequest(rawArgs) {
    return rawArgs.length === 0 || rawArgs.some((arg) => arg === '--help' || arg === '-h') || rawArgs[0] === 'help';
  }

  Object.assign(runtime, { usage, commandTopic, printHelp, isHelpRequest });
  return runtime;
}
