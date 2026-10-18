import fs from 'node:fs';
import path from 'node:path';

/** HTTP hosting and identity injection use a small page; real frontend coverage belongs to the artifact browser check. */
export function createWebStaticFixture(root: string): string {
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><html><head><title>Buildr Web</title><meta name="buildr-session" content="__BUILDR_SESSION_TOKEN__"><meta name="buildr-preview" content="__BUILDR_PREVIEW_IDENTITY__"><meta name="buildr-web-profile" content="__BUILDR_WEB_PROFILE__" /><link rel="stylesheet" href="/assets/test.css"></head><body><script type="module" src="/assets/test.js"></script></body></html>\n');
  fs.writeFileSync(path.join(root, 'assets/test.css'), 'body {}\n');
  fs.writeFileSync(path.join(root, 'assets/test.js'), 'export {};\n');
  return root;
}
