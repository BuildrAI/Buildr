function isSafeHref(href) {
  try {
    const url = new URL(href, 'https://example.invalid');
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function isTableSeparator(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function appendInline(parent, text, doc) {
  const pattern = /(`+)([^`]+?)\1|\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parent.append(doc.createTextNode(text.slice(lastIndex, match.index)));
    if (match[1] !== undefined) {
      const code = doc.createElement('code');
      code.textContent = match[2];
      parent.append(code);
    } else if (match[3] !== undefined) {
      const strong = doc.createElement('strong');
      strong.textContent = match[3];
      parent.append(strong);
    } else if (match[4] !== undefined) {
      const em = doc.createElement('em');
      em.textContent = match[4];
      parent.append(em);
    } else {
      const label = match[5];
      const href = match[6];
      if (isSafeHref(href)) {
        const link = doc.createElement('a');
        link.setAttribute('href', href);
        link.setAttribute('rel', 'noopener noreferrer');
        link.setAttribute('target', '_blank');
        link.textContent = label;
        parent.append(link);
      } else {
        parent.append(doc.createTextNode(`[${label}](${href})`));
      }
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parent.append(doc.createTextNode(text.slice(lastIndex)));
}

function createParagraph(text, doc) {
  const paragraph = doc.createElement('p');
  appendInline(paragraph, text, doc);
  return paragraph;
}

function createHeading(level, text, doc) {
  const heading = doc.createElement(`h${Math.min(Math.max(level, 1), 6)}`);
  appendInline(heading, text, doc);
  return heading;
}

function createList(ordered, items, doc) {
  const list = doc.createElement(ordered ? 'ol' : 'ul');
  for (const item of items) {
    const li = doc.createElement('li');
    appendInline(li, item, doc);
    list.append(li);
  }
  return list;
}

function createCodeBlock(language, code, doc) {
  const pre = doc.createElement('pre');
  const codeNode = doc.createElement('code');
  if (language) codeNode.setAttribute('data-language', language);
  codeNode.textContent = code;
  pre.append(codeNode);
  return pre;
}

function createTable(header, rows, doc) {
  const table = doc.createElement('table');
  const thead = doc.createElement('thead');
  const headRow = doc.createElement('tr');
  for (const cell of header) {
    const th = doc.createElement('th');
    appendInline(th, cell, doc);
    headRow.append(th);
  }
  thead.append(headRow);
  table.append(thead);
  const tbody = doc.createElement('tbody');
  for (const row of rows) {
    const tr = doc.createElement('tr');
    for (const cell of row) {
      const td = doc.createElement('td');
      appendInline(td, cell, doc);
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  return table;
}

export function renderMarkdown(markdown, doc = globalThis.document) {
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
      root.append(createTable(header, rows, doc));
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      root.append(createHeading(heading[1].length, heading[2].trim(), doc));
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
      root.append(createList(false, items, doc));
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
      root.append(createList(true, items, doc));
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
    root.append(createParagraph(paragraphLines.join(' '), doc));
  }

  return root;
}
