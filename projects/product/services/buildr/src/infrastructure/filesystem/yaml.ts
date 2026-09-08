import YAML from 'yaml';

export function parseYamlDocument(content: string, label = 'YAML document'): any {
  let document;
  try { document = YAML.parseDocument(content, { uniqueKeys: true, prettyErrors: true }); }
  catch (error) { throw new Error(`${label} is invalid YAML: ${error instanceof Error ? error.message : String(error)}`); }
  if (document.errors.length) throw new Error(`${label} is invalid YAML: ${document.errors.map((error) => error.message).join('; ')}`);
  const value = document.toJS({ mapAsMap: false });
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a YAML mapping.`);
  return value;
}

export function quoteYaml(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => String(item)));
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return JSON.stringify(String(value));
}

export function parseYamlValue(value: string): any {
  const document = YAML.parseDocument(value, { uniqueKeys: true, prettyErrors: true });
  if (document.errors.length) throw new Error(`Invalid YAML value: ${value} (${document.errors.map((error) => error.message).join('; ')})`);
  return document.toJS();
}
