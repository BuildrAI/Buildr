/** UI search starts at two non-whitespace Unicode characters; inner spaces stay literal. */
export function repositorySearchQuery(value: string): string {
  const query = value.trim();
  return Array.from(query).filter(character => !/\s/u.test(character)).length >= 2 ? query : '';
}
