function rootHelp(catalog: any): any  {
  const headings: any = {
    primary: 'Primary workspace commands:',
    'agent-machine': 'Agent machine commands:',
    maintenance: 'Product maintenance commands:',
  };
  const lines: any[] = ['Usage: buildr <command> [options]'];
  for (const surface of Object.keys(headings)) {
    const commands = catalog.filter((item: any) => item.executable && item.surface === surface);
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

export function registerCommandHelp(runtime: any, catalog: any): any  {
  function commandTopic(rawArgs: any): any  {
    const words = rawArgs.filter((arg: any) => !['--help', '-h'].includes(arg));
    if (words[0] === 'help') words.shift();
    if (words.length === 0) return 'root';
    return catalog
      .filter((item: any) => item.help && item.key.split(' ').every((token: any, index: any) => words[index] === token))
      .sort((left: any, right: any) => right.key.split(' ').length - left.key.split(' ').length)[0]?.key || null;
  }

  function printHelp(rawArgs: any): any  {
    const topic = commandTopic(rawArgs);
    if (!topic) return false;
    const descriptor = topic === 'root' ? null : catalog.find((item: any) => item.key === topic);
    const lines = topic === 'root' ? rootHelp(catalog) : descriptor.help;
    console.log(lines.join('\n'));
    return true;
  }

  function usage(): any  {
    console.error(rootHelp(catalog).join('\n'));
  }

  function isHelpRequest(rawArgs: any): any  {
    return rawArgs.length === 0 || rawArgs.some((arg: any) => arg === '--help' || arg === '-h') || rawArgs[0] === 'help';
  }

  Object.assign(runtime, { usage, commandTopic, printHelp, isHelpRequest });
  return runtime;
}
