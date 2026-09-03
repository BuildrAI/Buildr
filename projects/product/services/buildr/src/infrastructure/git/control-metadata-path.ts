import path from 'node:path';

function normalize(value: any): any  {
  return path.posix.normalize(String(value || '').replaceAll('\\', '/')).replace(/^\.\//u, '');
}

function insideOpenSpecChange(segments: any, controlIndex: any): any  {
  for (let index = 0; index + 1 < controlIndex; index += 1) {
    if (segments[index] === 'openspec' && segments[index + 1] === 'changes') return true;
  }
  return false;
}

export function controlMetadataPath(value: any): any  {
  const normalized = normalize(value);
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) return false;
  const segments = normalized.split('/');
  if (segments.includes('.git')) return true;
  if (segments[0] === '.buildr') return true;
  const buildrIndex = segments.indexOf('.buildr');
  return buildrIndex > 0 && insideOpenSpecChange(segments, buildrIndex);
}
