import { gzipSync, brotliCompressSync } from 'node:zlib';

/** Build once; the installed server only negotiates existing representations. */
export function precompressedAssets() {
  return {
    name: 'buildr-precompressed-assets',
    generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (!/\.(?:js|css|svg|json)$/.test(asset.fileName)) continue;
        const bytes = Buffer.from(asset.type === 'chunk' ? asset.code : asset.source);
        if (bytes.length < 1024) continue;
        for (const [extension, content] of [['gz', gzipSync(bytes)], ['br', brotliCompressSync(bytes)]]) {
          if (content.length < bytes.length) this.emitFile({ type: 'asset', fileName: `${asset.fileName}.${extension}`, source: content });
        }
      }
    },
  };
}
