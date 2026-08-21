const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Workspace.${field} must be a non-empty string.`);
  }
  return value.trim();
}

export function isWorkspaceId(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function createWorkspace({ id, name, description }) {
  if (!isWorkspaceId(id)) throw new Error('Workspace.id must be a UUID.');
  return Object.freeze({
    id,
    name: requiredText(name, 'name'),
    description: requiredText(description, 'description'),
  });
}
