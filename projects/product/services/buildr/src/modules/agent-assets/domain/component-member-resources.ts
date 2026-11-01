import path from 'node:path';

/** References are limited to the official component's own declared fragments. */
export function validateComponentMemberResources(definition: any): string[] {
  const resources = definition.memberResources;
  if (resources === undefined) return [];
  if (!resources || typeof resources !== 'object' || Array.isArray(resources)) return ['component memberResources must be a mapping.'];
  const errors: string[] = [];
  for (const [member, source] of Object.entries(resources)) {
    const prefix = `components/buildr/${definition.id}/contributions/`;
    if (definition.source !== 'buildr' || !definition.members?.skillContributions?.includes(member)
      || !member.startsWith(prefix) || !member.endsWith('.md') || member.includes('\\') || member.includes('\0')
      || path.posix.normalize(member) !== member || member.split('/').includes('..')
      || source !== `resources/workspace/${member}`) {
      errors.push(`Invalid component member resource: ${member}.`);
    }
  }
  return errors;
}
