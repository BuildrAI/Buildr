import path from 'node:path';

/** References are limited to the official component's own declared source members. */
export function validateComponentMemberResources(definition: any): string[] {
  const resources = definition.memberResources;
  if (resources === undefined) return [];
  if (!resources || typeof resources !== 'object' || Array.isArray(resources)) return ['component memberResources must be a mapping.'];
  const errors: string[] = [];
  for (const [member, source] of Object.entries(resources)) {
    const prefix = `components/buildr/${definition.id}/contributions/`;
    const fragment = Array.isArray(definition.members?.skillContributions) && definition.members.skillContributions.includes(member)
      && member.startsWith(prefix) && member.endsWith('.md');
    const command = Array.isArray(definition.members?.commandCollections) && definition.members.commandCollections.includes(member)
      && member === `commands/buildr/${definition.id}/manifest.yml`;
    if (definition.source !== 'buildr' || (!fragment && !command) || member.includes('\\') || member.includes('\0')
      || path.posix.normalize(member) !== member || member.split('/').includes('..')
      || source !== `resources/workspace/${member}`) {
      errors.push(`Invalid component member resource: ${member}.`);
    }
  }
  return errors;
}
