export type PrototypeNote = { id: string; title: string; text: string; position?: string };
export type PrototypeScene = { id: string; title: string; notes: PrototypeNote[]; states: Array<{ id: string; title: string; notes: PrototypeNote[] }> };
export type UiPrototypePage = { id: string; project: string; change: string; lifecycle: 'active' | 'archived'; provenance: string; path: string; title: string; sizeBytes: number; updatedAt: string; metadata?: { version:1; pages:PrototypeScene[] } };
export type UiPrototypeData = { taskId:string; prototypes:UiPrototypePage[]; diagnostics:Array<{ code:string; message:string; project?:string; change?:string; path?:string }> };
export function prototypeEntries(data: UiPrototypeData | null) {
  return (data?.prototypes || []).flatMap(file => (file.metadata?.pages || [{id:'default',title:file.title,notes:[],states:[]}]).map(scene => ({key:`${file.id}:${scene.id}`,file,scene})));
}
export type PrototypeEntry = ReturnType<typeof prototypeEntries>[number];
export function validPrototypeMessage(value: unknown, nonce: string, entries: PrototypeEntry[]) {
  if (!value || typeof value !== 'object') return null;
  const m = value as Record<string, unknown>;
  if (!['buildr:prototype:state','buildr:prototype:highlight','buildr:prototype:rendered'].includes(m.type as string) || m.nonce !== nonce || typeof m.page !== 'string') return null;
  const entry = entries.find(entry => entry.scene.id === m.page);
  if (!entry || (m.state !== '' && !entry.scene.states.some(state => state.id === m.state))) return null;
  const notes = [...entry.scene.notes,...(entry.scene.states.find(state => state.id === m.state)?.notes || [])];
  const highlight=m.type==='buildr:prototype:highlight';
  if (highlight && m.position === undefined) return null;
  if (m.position !== undefined && !(highlight && m.position === null) && !notes.some(note => note.position === m.position)) return null;
  return { kind:highlight?'highlight' as const:m.type==='buildr:prototype:rendered'?'rendered' as const:'selection' as const, entry, state:m.state as string, position:typeof m.position==='string'?m.position:undefined };
}
