export function normalizeOpenSpecContractText(content) {
  return String(content).replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').replace(/\n+$/, '\n');
}

export function parseOpenSpecRequirementBlocks(content) {
  const normalized = normalizeOpenSpecContractText(content);
  const matches = [...normalized.matchAll(/^### Requirement:\s*(.+?)\s*$/gm)];
  const requirements = new Map();
  for (let index = 0; index < matches.length; index += 1) {
    const title = matches[index][1].trim();
    if (!title) continue;
    const start = matches[index].index;
    const end = index + 1 < matches.length ? matches[index + 1].index : normalized.length;
    requirements.set(title, normalizeOpenSpecContractText(normalized.slice(start, end)));
  }
  return requirements;
}

export function openSpecSection(content, name) {
  const normalized = normalizeOpenSpecContractText(content);
  const header = new RegExp(`^## ${name}\\s*$`, 'm');
  const match = header.exec(normalized);
  if (!match) return '';
  const next = /^## /gm;
  next.lastIndex = match.index + match[0].length;
  const nextMatch = next.exec(normalized);
  return normalized.slice(match.index + match[0].length, nextMatch ? nextMatch.index : normalized.length);
}

export function parseOpenSpecDeltaSpec(content, capability) {
  const operations = [];
  for (const [section, type] of [['ADDED Requirements', 'ADDED'], ['MODIFIED Requirements', 'MODIFIED'], ['REMOVED Requirements', 'REMOVED']]) {
    const requirements = parseOpenSpecRequirementBlocks(openSpecSection(content, section));
    for (const [title, requirement] of requirements) operations.push({ type, capability, title, requirement });
  }
  const renamed = openSpecSection(content, 'RENAMED Requirements');
  const renamePattern = /-\s*FROM:\s*`?### Requirement:\s*(.+?)`?\s*\n\s*-\s*TO:\s*`?### Requirement:\s*(.+?)`?\s*(?=\n|$)/g;
  for (const match of renamed.matchAll(renamePattern)) {
    const from = match[1].trim();
    const to = match[2].trim();
    if (from && to && from !== to) operations.push({ type: 'RENAMED', capability, from, to });
  }
  return operations;
}
