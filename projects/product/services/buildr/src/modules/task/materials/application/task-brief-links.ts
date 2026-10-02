import path from 'node:path';
import type { TaskMaterialReference } from '../../../../../build/generated/task-dto.ts';
import type { LegacyTaskBriefReference } from './task-materials-application.ts';

export type BriefLinkDiagnostic = { code: string; message: string };

// Only Markdown destinations are changed. Source files, code blocks and code spans remain untouched.
export function normalizeTaskBriefLinks(content: string, origin: LegacyTaskBriefReference, materials: TaskMaterialReference[]) {
  const diagnostics: BriefLinkDiagnostic[] = [];
  let rewrittenLinks = 0;
  function destination(raw: string, image = false): string {
    if (!raw || raw.startsWith('#') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw) || raw.startsWith('//') || raw.startsWith('@task/') || raw.startsWith('projects/')) return raw;
    const fail = () => {
      diagnostics.push({ code: 'task_brief_link_unresolved', message: `旧正文链接未转换，保留原文且不扩大读取范围：${raw}` });
      return raw;
    };
    if (image) return fail();
    const hash = raw.indexOf('#'), fragment = hash < 0 ? '' : raw.slice(hash), encoded = hash < 0 ? raw : raw.slice(0, hash);
    let decoded: string;
    try { decoded = decodeURIComponent(encoded); } catch { return fail(); }
    if (decoded.includes('\\') || decoded.includes('\0') || decoded.includes('?') || decoded.startsWith('/') || /^[A-Za-z]:/.test(decoded) || /%(?:2f|5c|00)/i.test(encoded)) return fail();
    const projectAlias = decoded.startsWith('@project/');
    if (decoded.startsWith('@') && !projectAlias) return fail();
    const originPath = origin.source.path.replace(/^@project\//, '');
    const resolved = path.posix.normalize(projectAlias ? decoded.slice('@project/'.length) : path.posix.join(path.posix.dirname(originPath), decoded));
    if (!resolved.endsWith('.md') || resolved === '..' || resolved.startsWith('../') || resolved.startsWith('/')) return fail();
    let target: string;
    const encodedPath = resolved.split('/').map(segment => encodeURIComponent(segment).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
    if (origin.source.kind === 'project') target = `projects/${origin.source.project}/${encodedPath}${fragment}`;
    else {
      if (projectAlias || !materials.some(item => item.source.kind === 'task' && item.source.path === resolved)) return fail();
      target = `${encodedPath}${fragment}`;
    }
    if (target !== raw) rewrittenLinks += 1;
    return target;
  }
  const escaped = (text: string, index: number) => {
    let count = 0;
    for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) count += 1;
    return count % 2 !== 0;
  };
  function inline(text: string): string {
    const runs = [...text.matchAll(/`+/g)].filter(run => !escaped(text, run.index!));
    const last = new Map<number, number>(), next = new Map<number, number>();
    runs.forEach(run => { const length = run[0].length, index = run.index!; const previous = last.get(length); if (previous !== undefined) next.set(previous, index); last.set(length, index); });
    const spans: Array<{ start: number; end: number }> = [];
    let covered = -1;
    for (const run of runs) {
      const start = run.index!, closing = next.get(start);
      if (start < covered || closing === undefined) continue;
      covered = closing + run[0].length; spans.push({ start, end: covered });
    }
    let spanIndex = 0;
    // Match complete reader link tokens only; unmatched delimiters remain ordinary text.
    const pattern = /!\[([^\]]*)\]\(([^)\n]+)\)|(`+)([^`]+?)\3|\[([^\]]+)\]\(([^)\n]+)\)/g;
    return text.replace(pattern, (token, _imageLabel, imageHref, ticks, _code, _label, href, offset) => {
      while (spanIndex < spans.length && spans[spanIndex].end <= offset) spanIndex += 1;
      if (spanIndex < spans.length && offset >= spans[spanIndex].start && offset < spans[spanIndex].end) return token;
      if (ticks || escaped(text, offset)) return token;
      const raw = imageHref ?? href;
      const target = raw.match(/^([ \t]*)(<[^>]*>|[^\s]+)(.*)$/);
      if (!target || !/^(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'))?[ \t]*$/.test(target[3])) return token;
      const angled = target[2].startsWith('<');
      const updated = destination(angled ? target[2].slice(1, -1) : target[2], imageHref !== undefined);
      const value = target[1] + (angled ? `<${updated}>` : updated) + target[3];
      return token.slice(0, token.length - raw.length - 1) + value + ')';
    });
  }
  let fence: { character: string; length: number; quoteDepth: number; listIndent: number } | null = null;
  let pending = '', output = '';
  const flush = () => { output += inline(pending); pending = ''; };
  const quote = (line: string, depth = Number.POSITIVE_INFINITY) => {
    let count = 0, stripped = line;
    while (count < depth) {
      const marker = stripped.match(/^ {0,3}>[ \t]?/);
      if (!marker) break;
      stripped = stripped.slice(marker[0].length); count += 1;
    }
    return { count, stripped };
  };
  for (const line of content.split(/(?<=\n)/u)) {
    const container = quote(line);
    if (fence) {
      const fenced = quote(line, fence.quoteDepth);
      if (fenced.count === fence.quoteDepth && (!fence.listIndent || /^\s*$/.test(fenced.stripped) || fenced.stripped.startsWith(' '.repeat(fence.listIndent)))) {
        const body = fenced.stripped.slice(fence.listIndent), marker = body.match(/^ {0,3}(`{3,}|~{3,})/);
        if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length && body.slice(marker[0].length).trim() === '') fence = null;
        output += line; continue;
      }
      fence = null;
    }
    const list = container.stripped.match(/^ {0,3}(?:[-+*]|\d+[.)])[ \t]+(?=`{3,}|~{3,})/);
    const body = list ? container.stripped.slice(list[0].length) : container.stripped;
    const marker = body.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) { flush(); fence = { character: marker[1][0], length: marker[1].length, quoteDepth: container.count, listIndent: list?.[0].length || 0 }; output += line; continue; }
    if (/^(?: {4}|\t)/.test(body) && !/^\s*[-*+]\s/.test(body)) { flush(); output += line; continue; }
    const definition = body.match(/^( {0,3}\[[^\]\n]+\]:\s*)(<[^>\n]*>|[^\s\n]+)/);
    if (definition) {
      flush(); const token = definition[2], angled = token.startsWith('<');
      const updated = destination(angled ? token.slice(1, -1) : token);
      output += line.slice(0, line.length - body.length) + definition[1] + (angled ? `<${updated}>` : updated) + body.slice(definition[0].length); continue;
    }
    if (/^\s*$/.test(body)) { flush(); output += line; continue; }
    pending += line;
  }
  flush();
  return { content: output, rewrittenLinks, diagnostics };
}
