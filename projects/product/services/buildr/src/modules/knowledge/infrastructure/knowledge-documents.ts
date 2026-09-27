import fs from "node:fs";
import path from "node:path";
import { digest, resolveKnowledgeFile } from "./knowledge-files.ts";

export type DocumentLocation = {
  id: string;
  title: string;
  root: string;
  publicOnly?: boolean;
};
export type KnowledgeDocument = {
  id: string;
  path: string;
  title: string;
  location: string;
  group: string;
  artifactId: string | null;
  workspacePath: string | null;
};
const EXCLUDED = new Set([
  "node_modules", "build", "dist", "web-dist", "coverage", "target", "out",
  "vendor", "openspec", "skills", "rules", "resources", "components",
  "fixtures", "__fixtures__", "test-fixtures", "archive", "archives",
]);
const ROOT_DOCUMENT = /^(?:readme(?:[._-][\w-]+)?|contributing|security|changelog)\.md$/i;
const MAX_DOCUMENTS = 1000;
const MAX_ENTRIES = 20000;

function ordinaryName(name: string) {
  return !name.startsWith(".") && !EXCLUDED.has(name.toLowerCase()) &&
    !/(?:credential|secret|password|token|^id_rsa$|^id_ed25519$)/i.test(name);
}

// Read a bounded heading rather than loading every body to build a directory.
function heading(file: string, fallback: string) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) return null;
    const buffer = Buffer.alloc(8192);
    const count = fs.readSync(fd, buffer, 0, buffer.length, 0);
    if (buffer.subarray(0, count).includes(0)) return null;
    const content = buffer.subarray(0, count).toString("utf8");
    return { title: content.match(/^#\s+(.+?)\s*#*\s*$/m)?.[1]?.trim() || fallback,
      identity: `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}` };
  } finally { fs.closeSync(fd); }
}

export function discoverKnowledgeDocuments(
  locations: DocumentLocation[],
  registered: Map<string, string> = new Map(),
) {
  const documents: KnowledgeDocument[] = [];
  const files = new Map<string, { root: string; path: string }>();
  const diagnostics: string[] = [];
  const seenFiles = new Set<string>();
  const seenDirectories = new Set<string>();
  const versions: string[] = [];
  let visited = 0;
  let truncated = false;
  let incomplete = false;
  for (const location of locations) {
    let base: string;
    try { base = fs.realpathSync(location.root); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        incomplete = true;
        diagnostics.push(`${location.title}：文档位置暂不可读取。`);
      }
      continue;
    }
    function walk(relative: string, depth: number) {
      if (truncated) return;
      if (depth > 32) {
        incomplete = true;
        diagnostics.push(`${location.title}/${relative}：目录层级超过读取范围。`);
        return;
      }
      const directory = path.join(base, relative);
      try {
        // Never traverse symlinked directories, including links inside the root.
        if (fs.realpathSync(directory) !== directory || fs.lstatSync(directory).isSymbolicLink()) return;
        // A public-only root must not suppress a later full scope scan.
        const key = `${directory}:${location.publicOnly && !relative ? "public" : "full"}`;
        if (seenDirectories.has(key)) return;
        seenDirectories.add(key);
        const handle = fs.opendirSync(directory);
        const entries: fs.Dirent[] = [];
        try {
          let entry: fs.Dirent | null;
          while ((entry = handle.readSync())) {
            if (++visited > MAX_ENTRIES) { truncated = true; break; }
            entries.push(entry);
          }
        } finally { handle.closeSync(); }
        entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
        for (const entry of entries) {
          if (documents.length >= MAX_DOCUMENTS) { truncated = true; break; }
          if (entry.isSymbolicLink() || !ordinaryName(entry.name)) continue;
          const child = relative ? `${relative}/${entry.name}` : entry.name;
          if (location.publicOnly && !relative &&
              !(entry.isDirectory() && entry.name === "docs") && !ROOT_DOCUMENT.test(entry.name)) continue;
          if (entry.isDirectory()) { walk(child, depth + 1); continue; }
          if (!entry.isFile() || !/\.md$/i.test(entry.name) || /^(?:AGENTS|SKILL)\.md$/i.test(entry.name)) continue;
          try {
            const actual = resolveKnowledgeFile(base, child);
            if (actual !== path.join(base, child) || seenFiles.has(actual)) continue;
            const observed = heading(actual, entry.name.replace(/\.md$/i, ""));
            if (!observed) continue;
            const id = digest(`${location.id}\0${child}`);
            seenFiles.add(actual);
            files.set(id, { root: base, path: child });
            versions.push(`${id}:${observed.identity}:${observed.title}`);
            documents.push({ id, path: child, title: observed.title,
              location: location.id, group: location.title,
              workspacePath: null,
              artifactId: registered.get(actual) ?? null });
          } catch {
            incomplete = true;
            diagnostics.push(`${location.title}/${child}：文件暂不可读取。`);
          }
        }
      } catch {
        incomplete = true;
        diagnostics.push(`${location.title}/${relative || "."}：目录暂不可读取。`);
      }
    }
    walk("", 0);
  }
  if (truncated) diagnostics.push("文档目录达到扫描上限，当前数量仅包含已发现文件。");
  return { documents, files, revision: digest(JSON.stringify(versions)),
    totalCount: documents.length, truncated: truncated || incomplete, diagnostics };
}
