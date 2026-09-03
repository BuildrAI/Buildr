import path from 'node:path';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const productRoot = path.resolve(serviceRoot, '../..');

export type ContractOutputPaths = { backend: string; web: string };

export function contractOutputPaths(backendRelative: string, filename: string, outputRoot?: string): ContractOutputPaths {
  if (outputRoot) {
    const root = path.resolve(outputRoot);
    return {
      backend: path.join(root, 'buildr', 'src', backendRelative, 'generated', filename),
      web: path.join(root, 'buildr-web', 'src', 'api', 'generated', filename),
    };
  }
  return {
    backend: path.join(serviceRoot, 'src', backendRelative, 'generated', filename),
    web: path.join(productRoot, 'services', 'buildr-web', 'src', 'api', 'generated', filename),
  };
}

export function cliOutputRoot(argv: string[]): string | undefined {
  const index = argv.indexOf('--output-root');
  if (index < 0) return undefined;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error('--output-root requires a directory.');
  return path.resolve(value);
}
