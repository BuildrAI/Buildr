export type PrototypeNote = { id: string; title: string; text: string; position?: string };
export type PrototypeScene = { id: string; title: string; notes: PrototypeNote[]; states: Array<{ id: string; title: string; notes: PrototypeNote[] }> };
export type PrototypeMetadata = { version: 1; pages: PrototypeScene[] };

/** Non-executable bounded JSON. Never interpret markup, links, paths, or commands. */
export function readPrototypeMetadata(html: string): { metadata?: PrototypeMetadata; error?: string } {
  const blocks = [...html.matchAll(/<script\b[^>]*\bid=["']buildr-prototype["'][^>]*>([\s\S]*?)<\/script\s*>/gi)];
  if (!blocks.length) return {};
  try {
    if (blocks.length !== 1 || !/\btype=["']application\/json["']/i.test(blocks[0][0].split('>')[0]) || Buffer.byteLength(blocks[0][1]) > 65536) throw Error();
    const raw = JSON.parse(blocks[0][1]);
    const object = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error(); return v as Record<string, unknown>; };
    const str = (v: unknown, max: number): string => { if (typeof v !== 'string' || !v.trim() || v.length > max) throw Error(); return v; };
    const id = (v: unknown): string => { const s = str(v, 64); if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(s)) throw Error(); return s; };
    const list = (v: unknown, max: number): unknown[] => { if (!Array.isArray(v) || v.length > max) throw Error(); return v; };
    const unique = <T extends { id: string }>(items: T[]): T[] => { if (new Set(items.map(i => i.id)).size !== items.length) throw Error(); return items; };
    const notes = (v: unknown): PrototypeNote[] => unique(list(v, 30).map(value => { const n = object(value); return { id:id(n.id), title:str(n.title,160), text:str(n.text,4000), ...(n.position === undefined ? {} : {position:id(n.position)}) }; }));
    const root = object(raw);
    if (root.version !== 1) throw Error();
    const pages = unique(list(root.pages, 20).map(value => { const page = object(value); return {
      id:id(page.id), title:str(page.title,160), notes:notes(page.notes),
      states:unique(list(page.states ?? [],20).map(value => { const state = object(value); return {id:id(state.id),title:str(state.title,160),notes:notes(state.notes)}; })),
    }; }));
    if (!pages.length) throw Error();
    return { metadata: { version:1, pages } };
  } catch { return { error:'原型说明格式无效或超过限制，仍可查看隔离页面。' }; }
}
