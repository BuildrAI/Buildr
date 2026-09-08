export function isScriptSource(file: string): boolean {
  return /\.(?:[cm]?[jt]s|[jt]sx)$/.test(file);
}

export function platformNamespaceImports(files: readonly { path: string; source: string }[]): string[] {
  return files.filter((file) => isScriptSource(file.path)
    && /import\s+\*\s+as\s+\w+\s+from\s+['"][^'"]*\/platform\.[cm]?[jt]s['"]/.test(file.source))
    .map((file) => file.path).sort();
}
