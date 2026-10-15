import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import test, { type TestContext } from 'node:test';
import { assertMarkdownImageSourceRoot, documentImageQuery, MAX_DOCUMENT_IMAGE_BYTES, observeMarkdownImageContext, readMarkdownImage } from '../../src/infrastructure/filesystem/markdown-images.ts';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ZkAAAAASUVORK5CYII=', 'base64');
const digest = (bytes: string | Buffer) => `sha256-${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const write = (file: string, bytes: string | Buffer) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); };
const code = (expected: string) => (error: unknown) => error instanceof Error && 'code' in error && error.code === expected;
function fixture(t: TestContext, content = '![实际图片](../assets/example.png)\n') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-markdown-images-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'source');
  const source = { root, path: 'docs/guide.md', identity: ['project', 'example'] };
  write(path.join(root, source.path), content);
  write(path.join(root, 'assets/example.png'), png);
  const context = observeMarkdownImageContext(source, content)!;
  assert.ok(context);
  return { base, root, source, context };
}

test('受控图片返回原字节和允许MIME，父相对及编码文件名绑定当前正文', t => {
  // The owner validates signatures and MIME; image pixel decoding is a browser boundary.
  const examples = [
    ['图 表.png', 'image/png', png],
    ['example.jpeg', 'image/jpeg', Buffer.from([255, 216, 255, 224, 0, 2, 255, 217])],
    ['example.gif', 'image/gif', Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')],
    ['example.webp', 'image/webp', Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64')],
  ] as const;
  const body = examples.map(([name]) => `![图片](../assets/${encodeURIComponent(name)})`).join('\n');
  const f = fixture(t, body);
  assert.equal(f.context.documentDigest, digest(body));
  for (const [name, contentType, bytes] of examples) {
    write(path.join(f.root, 'assets', name), bytes);
    const read = readMarkdownImage(() => f.source, { ...f.context, href: `../assets/${encodeURIComponent(name)}` });
    assert.deepEqual(read.bytes, bytes); assert.equal(read.contentType, contentType); assert.equal(read.filename, name);
  }
});

test('文件存在不授权图片读取，普通链接、围栏代码和行内代码中的伪引用拒绝', t => {
  const href = '../assets/example.png';
  for (const body of [
    `[普通链接](${href})`, `\`![代码](${href})\``, `\`\` literal \` ![代码](${href}) \`\``,
    `\`\`\`markdown\n![代码](${href})\n\`\`\``, `~~~markdown\n![代码](${href})\n~~~`,
    `\`\`\`\`markdown title\n![代码](${href})\n\`\`\`\``,
    `  ~~~markdown title\n![代码](${href})\n   ~~~~`,
    `\`\`\`\`\n\`\`\`\n![代码](${href})\n\`\`\`\``,
    `~~~\n\`\`\`\n![代码](${href})`, `\\![转义图片](${href})`, '正文没有这个引用',
  ]) {
    const f = fixture(t, body);
    assert.throws(() => readMarkdownImage(() => f.source, { ...f.context, href }), code('document_image_reference_missing'));
  }
  const body = `~~~example\n代码\n~~~~\n![真实图片](${href})`;
  const f = fixture(t, body);
  assert.deepEqual(readMarkdownImage(() => f.source, { ...f.context, href }).bytes, png);
});

test('真实引用仍拒绝远程、绝对、编码越界、敏感资料和脚本类型', t => {
  for (const [href, errorCode] of [
    ['https://example.invalid/example.png', 'document_image_path_forbidden'],
    ['/assets/example.png', 'document_image_path_forbidden'],
    ['%2Fassets/example.png', 'document_image_path_forbidden'],
    ['..%2F..%2Foutside.png', 'document_image_path_forbidden'],
    ['../assets/secret.png', 'document_image_path_forbidden'],
    ['../.credentials/example.png', 'document_image_path_forbidden'],
    ['../assets/example.svg', 'document_image_type_forbidden'],
    ['../assets/a%5Cb.png', 'document_image_path_forbidden'],
    ['../assets/a%00b.png', 'document_image_path_forbidden'],
  ]) {
    const f = fixture(t, `![真实引用](${href})`);
    assert.throws(() => readMarkdownImage(() => f.source, { ...f.context, href }), code(errorCode));
  }
});

test('符号链接文件或目录、FIFO、超限内容和错误签名不能返回图片字节', t => {
  const f = fixture(t);
  const read = (href: string) => {
    const body = `![实际图片](${href})`;
    write(path.join(f.root, f.source.path), body);
    const context = observeMarkdownImageContext(f.source, body)!;
    return readMarkdownImage(() => f.source, { ...context, href });
  };
  fs.symlinkSync('example.png', path.join(f.root, 'assets/link.png'));
  fs.symlinkSync('assets', path.join(f.root, 'linked-assets'));
  assert.throws(() => read('../assets/link.png'), code('document_image_path_forbidden'));
  assert.throws(() => read('../linked-assets/example.png'), code('document_image_path_forbidden'));
  fs.symlinkSync('source', path.join(f.base, 'aliased-root'));
  assert.throws(() => assertMarkdownImageSourceRoot(f.base, path.join(f.base, 'aliased-root')), code('document_image_path_forbidden'));
  write(path.join(f.root, 'assets/large.png'), png);
  fs.truncateSync(path.join(f.root, 'assets/large.png'), MAX_DOCUMENT_IMAGE_BYTES + 1);
  assert.throws(() => read('../assets/large.png'), code('document_image_content_limit'));
  write(path.join(f.root, 'assets/wrong.png'), Buffer.from('<html>not an image</html>'));
  assert.throws(() => read('../assets/wrong.png'), code('document_image_invalid'));
  if (process.platform !== 'win32') {
    execFileSync('mkfifo', [path.join(f.root, 'assets/pipe.png')]);
    assert.throws(() => read('../assets/pipe.png'), code('document_image_content_limit'));
  }
});

test('正文漂移与同字节替换来源根拒绝旧上下文，读后复核也拒绝来源切换', t => {
  const f = fixture(t), href = '../assets/example.png';
  fs.appendFileSync(path.join(f.root, f.source.path), '\n正文外部更新');
  assert.throws(() => readMarkdownImage(() => f.source, { ...f.context, href }), code('document_image_context_changed'));
  const g = fixture(t);
  const replacement = path.join(g.base, 'replacement');
  write(path.join(replacement, g.source.path), fs.readFileSync(path.join(g.root, g.source.path)));
  write(path.join(replacement, 'assets/example.png'), png);
  const next = { ...g.source, root: replacement };
  assert.throws(() => readMarkdownImage(() => next, { ...g.context, href }), code('document_image_context_changed'));
  let observations = 0;
  assert.throws(() => readMarkdownImage(() => ++observations === 1 ? g.source : next, { ...g.context, href }), code('document_image_context_changed'));
  fs.renameSync(g.root, path.join(g.base, 'old-root'));
  fs.renameSync(replacement, g.root);
  assert.throws(() => readMarkdownImage(() => g.source, { ...g.context, href }), code('document_image_context_changed'), '绝对路径及正文相同也不能忽略根inode变化');
});

test('可选图片观察失败不损害既有正文，查询参数严格且读取零写入', t => {
  const f = fixture(t), before = fs.readdirSync(f.root, { recursive: true });
  assert.equal(observeMarkdownImageContext(f.source, '不同的缓存正文'), undefined);
  assert.equal(observeMarkdownImageContext(f.source, fs.readFileSync(path.join(f.root, f.source.path), 'utf8'), digest('不同版本')), undefined);
  assert.equal(observeMarkdownImageContext({ ...f.source, path: 'missing.md' }, '已读正文'), undefined);
  const parameters = new URLSearchParams({ href: '../assets/example.png', expectedDocumentDigest: f.context.documentDigest, expectedSourceIdentity: f.context.sourceIdentity, documentPath: f.source.path });
  assert.deepEqual(documentImageQuery(parameters, true), { href: '../assets/example.png', ...f.context, path: f.source.path });
  for (const mutation of ['unknown', 'duplicate', 'missing']) {
    const invalid = new URLSearchParams(parameters);
    if (mutation === 'unknown') invalid.set('root', f.root);
    if (mutation === 'duplicate') invalid.append('href', '../assets/example.png');
    if (mutation === 'missing') invalid.delete('expectedSourceIdentity');
    assert.throws(() => documentImageQuery(invalid, true), code('document_image_input_invalid'));
  }
  assert.deepEqual(fs.readdirSync(f.root, { recursive: true }), before);
});
