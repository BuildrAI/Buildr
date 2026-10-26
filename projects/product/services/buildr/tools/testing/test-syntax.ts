import fs from 'node:fs';
import path from 'node:path';
import {transformSync, type Message} from 'esbuild';

/** Parse only: no module execution, dependency loading or semantic type claim. */
export function testSyntaxFindings(file: string, content: string) {
  const loader = /\.[cm]?tsx?$/u.test(file) ? file.endsWith('tsx') ? 'tsx' : 'ts'
    : file.endsWith('jsx') ? 'jsx' : 'js';
  try {
    transformSync(content, {sourcefile:file, loader, format:'esm', target:'esnext', logLevel:'silent'});
    return [];
  } catch (error) {
    if (!error || typeof error !== 'object' || !('errors' in error) || !Array.isArray(error.errors)) throw error;
    return (error.errors as Message[]).map(item => ({file, line:item.location?.line ?? 1,
      column:(item.location?.column ?? 0) + 1, message:item.text}));
  }
}

export function checkTestSyntax(servicesRoot = path.resolve(import.meta.dirname, '../../..')) {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.[cm]?[jt]sx?$/u.test(entry.name)) files.push(file);
    }
  };
  for (const service of fs.readdirSync(servicesRoot, {withFileTypes:true})) {
    const root = path.join(servicesRoot, service.name, 'test');
    if (service.isDirectory() && fs.statSync(root, {throwIfNoEntry:false})?.isDirectory()) visit(root);
  }
  const findings = files.sort().flatMap(file => testSyntaxFindings(path.relative(servicesRoot, file), fs.readFileSync(file,'utf8')));
  return {files:files.length, findings};
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(import.meta.filename)) {
  const result = checkTestSyntax();
  for (const item of result.findings) console.error(`${item.file}:${item.line}:${item.column}: ${item.message}`);
  console.log(`Test and helper syntax: ${result.files} files, ${result.findings.length} errors. This is parsing, not strict test-source type checking.`);
  process.exitCode = result.findings.length ? 1 : 0;
}
