import assert from 'node:assert/strict';

export const codeEditor = '.code-explorer-stage .cm-editor';
export const codeMarkdown = '.code-explorer-stage :is(.file-editing-reading .markdown-body, .repository-markdown)';

type EditorCheck = { text?: string; contains?: string; line?: number };

/** The pinned CodeMirror view's findFromDOM uses this same cmTile.root.view lookup. */
function editorState(check: EditorCheck = {}) {
  const host = [...document.querySelectorAll<HTMLElement>('.code-explorer-stage .cm-editor')].find(node => node.getClientRects().length > 0);
  const content = host?.querySelector<HTMLElement>('.cm-content');
  const view = (content as any)?.cmTile?.root?.view;
  if (!view) return null;
  const text = view.state.doc.toString(), line = view.state.doc.lineAt(view.state.selection.main.head).number;
  if (check.text !== undefined && text !== check.text || check.contains !== undefined && !text.includes(check.contains) || check.line !== undefined && line !== check.line) return null;
  return { length: view.state.doc.length, lines: view.state.doc.lines, line, selection: { from: view.state.selection.main.from, to: view.state.selection.main.to }, readOnly: view.state.readOnly, editable: view.contentDOM.contentEditable === 'true', scrollTop: view.scrollDOM.scrollTop, scrollLeft: view.scrollDOM.scrollLeft };
}

function normalized(content: string, omitTrailingEmpty = false) {
  const text = content.replace(/\r\n?/g, '\n');
  return omitTrailingEmpty && text.endsWith('\n') ? text.slice(0, -1) : text;
}

export async function assertEditorText(page: any, content: string, options: { omitTrailingEmpty?: boolean; readOnly?: boolean } = {}) {
  const text = normalized(content, options.omitTrailingEmpty);
  const handle = await page.waitForFunction(editorState, { text });
  const state = await handle.jsonValue();
  assert.equal(state.length, text.length, '编辑器文档与实际读取正文逐字符一致');
  assert.equal(state.lines, text.split('\n').length, '虚拟化不丢失文档行数');
  if (options.readOnly !== undefined) {
    assert.equal(state.readOnly, options.readOnly);
    assert.equal(state.editable, !options.readOnly);
  }
  return state;
}

export async function assertEditorLine(page: any, globalLine: number, firstLine = 1) {
  const localLine = globalLine - firstLine + 1;
  const handle = await page.waitForFunction(editorState, { line: localLine });
  const state = await handle.jsonValue();
  assert.equal(state.line + firstLine - 1, globalLine, '所选行保留当前来源的真实行号');
  return state;
}

export async function editorScroll(page: any, top?: number) {
  return page.locator(codeEditor + ':visible').evaluate(async (host: HTMLElement, next?: number) => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const view = (host.querySelector('.cm-content') as any)?.cmTile?.root?.view;
    if (!view) throw new Error('可见文件未连接真实 CodeMirror 视图');
    if (next !== undefined) view.scrollDOM.scrollTop = next;
    return view.scrollDOM.scrollTop;
  }, top);
}

export async function editorPosition(page: any) {
  return page.locator(codeEditor + ':visible').evaluate(async (host: HTMLElement) => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const view = (host.querySelector('.cm-content') as any)?.cmTile?.root?.view;
    if (!view) throw new Error('可见文件未连接真实 CodeMirror 视图');
    return { from: view.state.selection.main.from, to: view.state.selection.main.to, scrollLeft: view.scrollDOM.scrollLeft };
  });
}

/** Search navigation must expose the actual hit, including a distant part of a virtualized long line. */
export async function assertVisibleSearchHit(page: any, globalLine: number, expected: string, details: Record<string, unknown> = {}) {
  assert.ok(expected.length, '当前分段必须含实际匹配字节');
  try {
    const handle = await page.waitForFunction(({ line, text }: { line: number; text: string }) => {
      const host = [...document.querySelectorAll<HTMLElement>('.code-explorer-stage .cm-editor')].find(node => node.getClientRects().length > 0);
      const view = (host?.querySelector('.cm-content') as any)?.cmTile?.root?.view;
      if (!view) return null;
      const clip = view.scrollDOM.getBoundingClientRect();
      const marks = [...host!.querySelectorAll<HTMLElement>('.repository-source-row[data-line="' + line + '"] mark.repository-search-hit')];
      const visible = marks.filter(mark => [...mark.getClientRects()].some(rect => rect.width > 0 && rect.height > 0 && rect.left >= Math.max(0, clip.left) - 1 && rect.right <= Math.min(innerWidth, clip.right) + 1 && rect.top >= Math.max(0, clip.top) - 1 && rect.bottom <= Math.min(innerHeight, clip.bottom) + 1));
      const shown = visible.map(mark => mark.textContent).join('');
      return visible.length > 0 && shown === text ? { text: shown, scrollLeft: view.scrollDOM.scrollLeft } : null;
    }, { line: globalLine, text: expected });
    const hit = await handle.jsonValue();
    assert.equal(hit.text, expected, '实际可见高亮与该分段的匹配字节完全一致');
    return hit.text as string;
  } catch (error) {
    console.error('[code-search-hit-location]', JSON.stringify({ line: globalLine, expected, location: details, scene: await page.evaluate(() => {
      const host = [...document.querySelectorAll<HTMLElement>('.code-explorer-stage .cm-editor')].find(node => node.getClientRects().length > 0);
      const view = (host?.querySelector('.cm-content') as any)?.cmTile?.root?.view;
      const box = (node: Element) => { const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }; };
      return { url: location.href, editor: view ? { length: view.state.doc.length, lines: view.state.doc.lines, selection: { from: view.state.selection.main.from, to: view.state.selection.main.to }, visibleRanges: view.visibleRanges.slice(0, 4), scroll: { top: view.scrollDOM.scrollTop, left: view.scrollDOM.scrollLeft, width: view.scrollDOM.scrollWidth, clientWidth: view.scrollDOM.clientWidth }, bounds: box(view.scrollDOM) } : null, marks: [...(host?.querySelectorAll<HTMLElement>('mark.repository-search-hit') || [])].slice(0, 8).map(mark => ({ text: mark.textContent?.slice(0, 160), line: mark.closest('[data-line]')?.getAttribute('data-line'), bounds: box(mark) })) };
    }) }));
    throw error;
  }
}

/** API observations are keyed by the active file's complete repository/checkout/commit identity. */
export function createCodeReadAssertions(page: any, workspaceUrl: string) {
  const files = new Map<string, any>(), editors = new Map<string, any>(), pending = new Set<Promise<void>>();
  const workspaceId = new URL(workspaceUrl).pathname.split('/').at(-1)!;
  const observe = (response: any) => {
    const url = new URL(response.url());
    if (!url.pathname.endsWith('/code/file') && !url.pathname.endsWith('/code/editor-file') || response.status() !== 200) return;
    const read = (async () => {
      try {
        const payload = await response.json();
        if (url.pathname.endsWith('/code/editor-file')) {
          const previous = editors.get(workspaceId + ':' + payload.fileId);
          if (!previous || payload.observedAt >= previous.observedAt) editors.set(workspaceId + ':' + payload.fileId, payload);
        } else {
          const source = payload.source, checkoutId = url.searchParams.get('checkoutId') || source.checkoutId || '';
          const key = JSON.stringify([url.searchParams.get('repositoryId') || source.repositoryId, checkoutId, checkoutId ? '' : url.searchParams.get('taskId') || source.taskId || '', url.searchParams.get('commitHash') || source.commitHash || '']) + ':' + payload.path;
          const previous = files.get(key);
          if (!previous || !payload.observedAt || payload.observedAt >= previous.observedAt) files.set(key, payload);
        }
      } catch { /* Aborted observations cannot stand in for a successful file read. */ }
    })();
    pending.add(read); void read.finally(() => pending.delete(read));
  };
  page.on('response', observe);
  const activeFile = async () => {
    await Promise.all([...pending]);
    const key = await page.locator('.code-open-files [role=tab][aria-selected=true]').getAttribute('data-tab-key');
    assert.ok(key, '当前文件页签必须有完整来源身份');
    const file = files.get(key);
    assert.ok(file, '当前页签必须对应实际成功的文件 API 读取：' + key);
    return file;
  };
  const assertCurrentBinding = async (file: any) => {
    const pane = page.locator('.code-explorer-stage .file-editing-pane:visible');
    if (!await pane.count()) return undefined;
    await Promise.all([...pending]);
    const fileId = await pane.getAttribute('data-file-id'), snapshot = editors.get(fileId);
    assert.ok(snapshot, '当前编辑器身份必须对应实际 editor-file 读取：' + fileId);
    assert.equal(snapshot.selector.kind, 'code');
    assert.equal(snapshot.selector.repositoryId, file.source.repositoryId);
    assert.equal(snapshot.selector.checkoutId, file.source.checkoutId);
    assert.equal(snapshot.selector.path, file.path);
    assert.equal(normalized(snapshot.content) === normalized(file.content), true, '文件 API 与编辑器 API 读取同一来源正文：' + file.path);
    return snapshot;
  };
  return {
    dispose: () => page.off('response', observe),
    activeFile,
    async text(fragment: string) {
      await page.waitForFunction(editorState, { contains: fragment });
      const file = await activeFile();
      assert.ok(file.content.includes(fragment), '实际文件 API 含预期正文');
      const snapshot = await assertCurrentBinding(file);
      const locatingMarkdown = Boolean(snapshot && file.kind === 'markdown' && await page.locator('.code-explorer-stage .file-editing-pane:visible .read-only-file-code-editor:visible').count());
      if (locatingMarkdown) await page.getByText('源码定位：只读查看，可返回阅读或明确进入编辑。', { exact: true }).waitFor();
      const omitTrailingEmpty = Boolean(file.page && file.page.endOffset < file.sizeBytes && file.content.endsWith('\n'));
      return assertEditorText(page, file.content, { omitTrailingEmpty, readOnly: snapshot ? locatingMarkdown || !snapshot.editable : Boolean(file.source.commitHash || file.page) });
    },
    async markdown(heading: string) {
      await page.locator(codeMarkdown).getByRole('heading', { name: heading, exact: true }).waitFor();
      const file = await activeFile();
      assert.equal(file.kind, 'markdown');
      assert.ok(file.content.includes(heading));
      await assertCurrentBinding(file);
      return file;
    },
    async line(globalLine: number) {
      const file = await activeFile();
      return assertEditorLine(page, globalLine, file.page?.startLine || 1);
    },
  };
}
