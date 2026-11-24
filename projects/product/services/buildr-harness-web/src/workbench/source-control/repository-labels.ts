/** The code disambiguates similarly named repositories; an identical name needs no repetition. */
export function codeRepositoryLabel(repository: {name: string; code?: string | null}): string {
  const name = repository.name || '', code = repository.code || '';
  return name && code && code !== name ? name + '（' + code + '）' : name || code;
}

/** Lists scan by stable code; the full label stays available in hover and accessible text. */
export function codeRepositoryCode(repository: {name: string; code?: string | null}): string {
  return repository.code || repository.name;
}
