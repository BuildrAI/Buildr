/** Parse one literal command at capture time; never infer provenance or outcome from output. */
/** One literal command only; no Shell expansion, redirection, chaining, escaping or environment prefix. */
export function simpleCommandWords(command: unknown): string[] | undefined {
  if (typeof command !== 'string' || command.length > 65536 || /[\0\n\r$`\\;&|<>]/.test(command)) return undefined;
  const words: string[] = [];
  let word = '', quote = '', started = false;
  for (const character of command.trim()) {
    if (quote) {
      if (character === quote) quote = '';
      else word += character;
    } else if (character === '"' || character === "'") { quote = character; started = true; }
    else if (/\s/.test(character)) {
      if (started) { words.push(word); word = ''; started = false; }
    } else {
      if (/[#()*?{}\[\]~]/.test(character)) return undefined;
      word += character; started = true;
    }
    if (word.length > 4096 || words.length > 128) return undefined;
  }
  if (quote) return undefined;
  if (started) words.push(word);
  return words.length > 0 ? words : undefined;
}
export interface SourceCommandDescription { operation: string }
/** Only operation words are kept; parameters and user material remain in the original DSH call. */
export function describeBoundSourceCommand(args: readonly string[]): SourceCommandDescription {
  const operation = args[0] === '--help' ? 'help' : args[0] === '--version' ? 'version'
    : typeof args[0] === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(args[0]) ? args[0] : 'Buildr CLI';
  const two = ['task', 'worktree', 'agent-assets', 'project', 'runtime'];
  const action = two.includes(operation) && typeof args[1] === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(args[1]) ? args[1] : undefined;
  const hasThird = operation === 'task' && ['materials', 'review', 'verification', 'work-context'].includes(action ?? '')
    || operation === 'agent-assets' && action === 'source';
  const third = hasThird && typeof args[2] === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(args[2]) ? args[2] : undefined;
  return { operation: [operation, action, third].filter(value => value !== undefined).join(' ') };
}
