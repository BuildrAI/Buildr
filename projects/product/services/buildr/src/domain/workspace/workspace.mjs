const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NODE_VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Workspace.${field} must be a non-empty string.`);
  }
  return value.trim();
}

export function isWorkspaceId(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function normalizeWorkspaceNodeRuntime(runtime, { required = true } = {}) {
  if (runtime === undefined || runtime === null) {
    if (required) throw new Error('Workspace.runtime.node.version must be an exact Node.js version.');
    return null;
  }
  if (!runtime || typeof runtime !== 'object' || Array.isArray(runtime)
    || !runtime.node || typeof runtime.node !== 'object' || Array.isArray(runtime.node)
    || Object.keys(runtime).some((field) => field !== 'node')
    || Object.keys(runtime.node).some((field) => field !== 'version')) {
    throw new Error('Workspace.runtime must contain only node.version.');
  }
  const version = String(runtime.node.version || '').trim().replace(/^v/, '');
  if (!NODE_VERSION_PATTERN.test(version)) throw new Error('Workspace.runtime.node.version must be an exact major.minor.patch version.');
  const [major, minor] = version.split('.').map(Number);
  if (major < 24 || (major === 24 && minor < 15)) {
    throw new Error('Workspace.runtime.node.version must satisfy Buildr engines.node >=24.15.0.');
  }
  return Object.freeze({ node: Object.freeze({ version }) });
}

export function createWorkspace({ id, name, description, runtime }, options = {}) {
  if (!isWorkspaceId(id)) throw new Error('Workspace.id must be a UUID.');
  return Object.freeze({
    id,
    name: requiredText(name, 'name'),
    description: requiredText(description, 'description'),
    runtime: normalizeWorkspaceNodeRuntime(runtime, options),
  });
}
