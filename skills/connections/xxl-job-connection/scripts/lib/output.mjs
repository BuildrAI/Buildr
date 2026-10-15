const protectedFields = new Set(['schemaVersion', 'operation', 'status', 'checks', 'revision', 'expectedRevision', 'authenticationRevision', 'teamRevision', 'localRevision', 'definitionRevision', 'expectedJobRevision', 'glueRevision', 'candidateSha256', 'bindingRevision', 'expectedBindingRevision', 'serviceRevision', 'connectionId', 'serviceId', 'workspaceId', 'authenticationSource', 'concurrencyProtection', 'availability', 'timeZone', 'apiVersion', 'action', 'triggerResult', 'handleResult', 'observedAt', 'submittedAt']);
const sensitiveKey = /^(?:password|accessToken|access_token|refresh_token|authorization|proxy-authorization|cookie|set-cookie|XXL_JOB_LOGIN_IDENTITY)$/iu;

/** Keeps raw configuration in private artifacts; sanitization is an output boundary only. */
export function createOutputProtection(secrets = new Set()) {
  const text = value => {
    const patterns = [...secrets].filter(value => typeof value === 'string' && value.length).sort((a, b) => b.length - a.length);
    const expression = patterns.length ? new RegExp(patterns.map(value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|'), 'gu') : null;
    let result = expression ? value.replace(expression, '[REDACTED]') : value;
    result = result.replace(/((?:authorization|proxy-authorization|cookie|set-cookie)\s*:\s*)[^\r\n]+/giu, '$1[REDACTED]');
    return result.replace(/((?:["']?(?:password|accessToken|access_token|refresh_token)["']?)\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;&}\]]+)/giu, '$1[REDACTED]');
  };
  const visit = value => {
    if (typeof value === 'string') return text(value);
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sensitiveKey.test(key) ? '[REDACTED]' : protectedFields.has(key) ? entry : visit(entry)]));
  };
  return { secrets, text, visit };
}
