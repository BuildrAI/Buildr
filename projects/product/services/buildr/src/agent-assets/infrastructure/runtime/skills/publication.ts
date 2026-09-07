import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

function validateOpenAiSkillMetadata(file: any, label: any): any  {
  let metadata;
  try {
    metadata = YAML.parse(fs.readFileSync(file, 'utf8'));
  } catch (error: any) {
    return [`${label} is invalid YAML: ${error.message}`];
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [`${label} must be a YAML object`];
  if (!metadata.interface || typeof metadata.interface !== 'object' || Array.isArray(metadata.interface)) return [`${label}.interface must be an object`];
  const errors: any[] = [];
  for (const field of ['display_name', 'short_description', 'default_prompt']) {
    if (typeof metadata.interface[field] !== 'string' || metadata.interface[field].trim().length === 0) errors.push(`${label}.interface.${field} must be a non-empty string`);
  }
  return errors;
}

const FORMAT_VALIDATORS: Readonly<Record<string, any>> = Object.freeze({
  'openai-skill-metadata': validateOpenAiSkillMetadata,
});

export function validateSkillPublication(adapter: any, { skillId, skillDir }: any): any  {
  const errors: any[] = [];
  for (const extension of adapter.traits.skills.publicationExtensions || []) {
    const file = path.join(skillDir, ...extension.path.split('/'));
    if (!fs.existsSync(file)) continue;
    const label = `adapter ${adapter.id} Skill ${skillId} publication extension ${extension.path}`;
    if (!fs.lstatSync(file).isFile()) {
      errors.push(`${label} must be a file`);
      continue;
    }
    errors.push(...FORMAT_VALIDATORS[extension.format](file, label));
  }
  return errors;
}
