import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../application/json-contracts.mjs';

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

export function commandSuggestions(input, candidates) {
  const normalized = String(input || '').trim().toLowerCase();
  if (!normalized) return [];
  return [...new Set(candidates)]
    .map((candidate) => {
      const value = candidate.toLowerCase();
      const prefix = value.startsWith(normalized) || normalized.startsWith(value.split(' ')[0]);
      return { candidate, distance: editDistance(normalized, value), prefix };
    })
    .filter(({ candidate, distance, prefix }) => prefix || distance <= Math.max(2, Math.floor(candidate.length / 3)))
    .sort((left, right) => Number(right.prefix) - Number(left.prefix) || left.distance - right.distance || left.candidate.localeCompare(right.candidate))
    .slice(0, 3)
    .map(({ candidate }) => candidate);
}

export function printCliError(rawArgs, { candidates, helpTopic = false } = {}) {
  const json = rawArgs.includes('--json');
  const inputArgs = rawArgs.filter((arg) => arg !== '--json');
  const topicArgs = helpTopic && inputArgs[0] === 'help' ? inputArgs.slice(1) : inputArgs;
  const input = topicArgs.join(' ').trim();
  const unknownOption = !helpTopic && inputArgs.length === 1 && inputArgs[0].startsWith('-');
  const code = helpTopic ? 'cli.unknown_help_topic' : unknownOption ? 'cli.unknown_option' : 'cli.unknown_command';
  const label = helpTopic ? 'help topic' : unknownOption ? 'option' : 'command';
  const suggestions = unknownOption && input === '-v'
    ? ['--version', '-V']
    : commandSuggestions(input, candidates || []);
  const message = `Unknown ${label}: ${input || '(empty)'}`;
  const help = 'buildr --help';
  if (json) {
    console.log(JSON.stringify(withJsonSchema(PUBLIC_JSON_SCHEMAS.cliError, {
      error: { code, message, input },
      suggestions,
      help,
    }), null, 2));
  } else {
    console.error(`Error: ${message}`);
    if (suggestions.length === 1) console.error(`Did you mean 'buildr ${suggestions[0]}'?`);
    else if (suggestions.length > 1) console.error(`Suggestions: ${suggestions.map((item) => `'buildr ${item}'`).join(', ')}`);
    console.error(`Run '${help}' for usage.`);
  }
  return 2;
}
