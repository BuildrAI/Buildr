import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { knowledgeError } from "../domain/knowledge-index.ts";
export const digest = (content: string | Buffer) =>
  crypto.createHash("sha256").update(content).digest("hex");
const LIMIT = 1024 * 1024;
const allowed = new Set([
  ".md",
  ".txt",
  ".html",
  ".svg",
  ".json",
  ".yml",
  ".yaml",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".java",
  ".kt",
  ".go",
  ".rs",
  ".py",
  ".css",
  ".scss",
  ".sql",
  ".xml",
  ".vue",
  ".svelte",
  ".sh",
]);
export function readKnowledgeFile(root: string, relative: string) {
  if (
    !relative ||
    relative.includes("\\") ||
    relative.includes("\0") ||
    path.isAbsolute(relative) ||
    /^[A-Za-z]:/.test(relative) ||
    path.posix.normalize(relative) !== relative ||
    relative
      .split("/")
      .some(
        (x) =>
          x === ".." ||
          x.startsWith(".") ||
          /^(node_modules|credentials?|secrets?|id_rsa|id_ed25519)$/i.test(x),
      ) ||
    /(?:credential|secret|\.pem$|\.key$)/i.test(path.basename(relative)) ||
    !allowed.has(path.extname(relative).toLowerCase())
  )
    throw knowledgeError(
      "knowledge_path_forbidden",
      "来源路径或文件类型不允许读取。",
    );
  const base = fs.realpathSync(root),
    actual = fs.realpathSync(path.join(base, relative));
  if (!actual.startsWith(base + path.sep))
    throw knowledgeError(
      "knowledge_path_forbidden",
      "来源真实路径超出登记范围。",
    );
  const actualRelative = path.relative(base, actual);
  if (
    actualRelative
      .split(path.sep)
      .some(
        (x) =>
          x.startsWith(".") ||
          /^(node_modules|credentials?|secrets?|passwords?|tokens?)$/i.test(x),
      ) ||
    /(?:credential|secret|password|token|\.pem$|\.key$|\.p12$|\.pfx$)/i.test(
      path.basename(actual),
    )
  )
    throw knowledgeError(
      "knowledge_path_forbidden",
      "来源真实位置属于禁止读取内容。",
    );
  const fd = fs.openSync(
    actual,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
  );
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > LIMIT)
      throw knowledgeError(
        "knowledge_content_limit",
        "仅支持不超过 1 MiB 的文本文件。",
      );
    const bytes = Buffer.alloc(LIMIT + 1);
    const size = fs.readSync(fd, bytes, 0, bytes.length, 0);
    if (size > LIMIT)
      throw knowledgeError("knowledge_content_limit", "内容超过读取上限。");
    const data = bytes.subarray(0, size);
    if (data.includes(0))
      throw knowledgeError(
        "knowledge_binary_forbidden",
        "二进制内容不可阅读。",
      );
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(data);
    } catch {
      throw knowledgeError(
        "knowledge_binary_forbidden",
        "内容不是有效 UTF-8 文本。",
      );
    }
    return { content, digest: digest(data), path: relative };
  } finally {
    fs.closeSync(fd);
  }
}
