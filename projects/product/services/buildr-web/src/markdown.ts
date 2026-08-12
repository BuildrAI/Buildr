// @ts-nocheck
export type MarkdownRenderOptions = {
  document?: Document;
  headingOffset?: number;
  allowRelativeLinks?: boolean;
  /** When true with allowRelativeLinks, relative href may include `..` segments (still sanitized by consumer / API). */
  allowParentRelativeLinks?: boolean;
  imageResolver?: (href: string) => { href: string } | null | undefined;
  onRelativeLinkClick?: (href: string, event: MouseEvent) => void;
};

function resolveSafeHref(href, { allowRelativeLinks = false, allowParentRelativeLinks = false } = {}) {
  const value = String(href ?? '').trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return { href: value, external: true };
      }
    } catch {
      return null;
    }
    return null;
  }

  if (!allowRelativeLinks) return null;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return null;
  if (value.startsWith('//') || value.startsWith('/') || value.includes('\\')) return null;

  const hashIndex = value.indexOf('#');
  const queryIndex = value.indexOf('?');
  let pathEnd = value.length;
  if (hashIndex >= 0) pathEnd = Math.min(pathEnd, hashIndex);
  if (queryIndex >= 0) pathEnd = Math.min(pathEnd, queryIndex);
  const pathPart = value.slice(0, pathEnd);
  const suffix = value.slice(pathEnd);
  const segments = pathPart.split('/');
  if (!allowParentRelativeLinks && segments.some((segment) => segment === '..')) return null;

  const normalizedPath = segments.filter((segment) => segment && segment !== '.').join('/');
  if (!normalizedPath && !suffix.startsWith('#')) return null;
  return { href: `${normalizedPath}${suffix}`, external: false };
}

function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableSeparator(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function appendInline(parent, text, doc, linkOptions) {
  const pattern = /!\[([^\]]*)\]\(([^)]+)\)|(\`+)([^\`]+?)\3|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parent.append(doc.createTextNode(text.slice(lastIndex, match.index)));
    if (match[1] !== undefined) {
      const resolved = linkOptions.imageResolver?.(match[2]);
      if (resolved?.href) {
        const image = doc.createElement('img');
        image.setAttribute('src', resolved.href);
        image.setAttribute('alt', match[1]);
        image.setAttribute('loading', 'lazy');
        parent.append(image);
      } else {
        parent.append(doc.createTextNode(`![${match[1]}](${match[2]})`));
      }
    } else if (match[3] !== undefined) {
      const code = doc.createElement('code');
      code.textContent = match[4];
      parent.append(code);
    } else if (match[5] !== undefined) {
      const strong = doc.createElement('strong');
      strong.textContent = match[5];
      parent.append(strong);
    } else if (match[6] !== undefined) {
      const em = doc.createElement('em');
      em.textContent = match[6];
      parent.append(em);
    } else {
      const label = match[7];
      const resolved = resolveSafeHref(match[8], linkOptions);
      if (resolved) {
        const link = doc.createElement('a');
        link.setAttribute('href', resolved.href);
        if (resolved.external) {
          link.setAttribute('rel', 'noopener noreferrer');
          link.setAttribute('target', '_blank');
        } else {
          link.className = 'markdown-relative-link';
          link.setAttribute('title', `相对路径：${resolved.href}`);
        }
        link.textContent = label;
        parent.append(link);
      } else {
        parent.append(doc.createTextNode(`[${label}](${match[8]})`));
      }
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parent.append(doc.createTextNode(text.slice(lastIndex)));
}

function createParagraph(text, doc, linkOptions) {
  const paragraph = doc.createElement('p');
  appendInline(paragraph, text, doc, linkOptions);
  return paragraph;
}

function createHeading(level, text, doc, headingOffset, linkOptions) {
  const heading = doc.createElement(`h${Math.min(Math.max(level + headingOffset, 1), 6)}`);
  appendInline(heading, text, doc, linkOptions);
  return heading;
}

function createList(ordered, items, doc, linkOptions) {
  const list = doc.createElement(ordered ? 'ol' : 'ul');
  let hasTask = false;
  for (const item of items) {
    const li = doc.createElement('li');
    const task = String(item).match(/^\[([ xX])\]\s+(.+)$/);
    if (task) {
      hasTask = true;
      li.className = 'task-list-item';
      const checkbox = doc.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.disabled = true;
      checkbox.checked = task[1].toLowerCase() === 'x';
      const label = doc.createElement('span');
      appendInline(label, task[2], doc, linkOptions);
      li.append(checkbox, label);
    } else {
      appendInline(li, item, doc, linkOptions);
    }
    list.append(li);
  }
  if (hasTask) list.className = `${list.className} task-list`.trim();
  return list;
}

function createHorizontalRule(doc) {
  return doc.createElement('hr');
}

function createCodeBlock(language, code, doc) {
  const pre = doc.createElement('pre');
  const codeNode = doc.createElement('code');
  if (language) codeNode.setAttribute('data-language', language);
  codeNode.textContent = code;
  pre.append(codeNode);
  return pre;
}

function createTable(header, rows, doc, linkOptions) {
  const table = doc.createElement('table');
  const thead = doc.createElement('thead');
  const headRow = doc.createElement('tr');
  for (const cell of header) {
    const th = doc.createElement('th');
    appendInline(th, cell, doc, linkOptions);
    headRow.append(th);
  }
  thead.append(headRow);
  table.append(thead);
  const tbody = doc.createElement('tbody');
  for (const row of rows) {
    const tr = doc.createElement('tr');
    for (const cell of row) {
      const td = doc.createElement('td');
      appendInline(td, cell, doc, linkOptions);
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  return table;
}

function normalizeRenderArgs(docOrOptions, maybeOptions) {
  if (docOrOptions && typeof docOrOptions.createElement === 'function') {
    return {
      doc: docOrOptions,
      options: maybeOptions && typeof maybeOptions === 'object' ? maybeOptions : {},
    };
  }
  if (docOrOptions && typeof docOrOptions === 'object') {
    return {
      doc: docOrOptions.document || globalThis.document,
      options: docOrOptions,
    };
  }
  return {
    doc: globalThis.document,
    options: maybeOptions && typeof maybeOptions === 'object' ? maybeOptions : {},
  };
}

export function renderMarkdown(markdown: string, docOrOptions: Document | MarkdownRenderOptions = globalThis.document, maybeOptions: MarkdownRenderOptions = {}): HTMLElement {
  const { doc, options } = normalizeRenderArgs(docOrOptions, maybeOptions);
  const headingOffset = Math.max(0, Number.isFinite(options.headingOffset) ? options.headingOffset : 0);
  const linkOptions = {
    allowRelativeLinks: Boolean(options.allowRelativeLinks),
    allowParentRelativeLinks: Boolean(options.allowParentRelativeLinks),
    imageResolver: options.imageResolver,
  };
  const root = doc.createElement('div');
  root.className = 'markdown-body';
  const lines = String(markdown ?? '').replace(/\r\n/g, '\n').split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```([\w-]+)?\s*$/);
    if (fence) {
      const language = fence[1] || '';
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      root.append(createCodeBlock(language, codeLines.join('\n'), doc));
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const header = splitTableRow(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      root.append(createTable(header, rows, doc, linkOptions));
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      root.append(createHorizontalRule(doc));
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      root.append(createHeading(heading[1].length, heading[2].trim(), doc, headingOffset, linkOptions));
      index += 1;
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      const items = [];
      while (index < lines.length) {
        const item = lines[index].match(/^[-*]\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      root.append(createList(false, items, doc, linkOptions));
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      const items = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\d+\.\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      root.append(createList(true, items, doc, linkOptions));
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;
    while (index < lines.length) {
      const next = lines[index];
      if (!next.trim()) break;
      if (/^(#{1,6})\s+/.test(next) || /^[-*]\s+/.test(next) || /^\d+\.\s+/.test(next) || /^```/.test(next) || (next.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1]))) break;
      paragraphLines.push(next.trim());
      index += 1;
    }
    root.append(createParagraph(paragraphLines.join(' '), doc, linkOptions));
  }

  return root;
}
