export type DesktopTool = 'explorer' | 'source-control';
let activeChannel = 'buildr-harness-desktop/v1:';
let activeOverride: boolean | undefined;

/** Allow assembled first-party shells (e.g. Buildr Development) to isolate their desktop bridge channel. */
export function configureDesktopBridge(options: { channel?: string; active?: boolean }) {
  if (options.channel) activeChannel = options.channel;
  if (options.active !== undefined) activeOverride = options.active;
}

export function desktopNotify(data: object) { console.info(activeChannel + JSON.stringify(data)); }
export function desktopPage(search: string): {kind:'chat'} | {kind:DesktopTool;workspaceId:string} | undefined {
  const query=new URLSearchParams(search), kind=query.get('dsh');
  if(kind==='chat')return {kind};
  const workspaceId=query.get('workspace');
  if((kind==='explorer'||kind==='source-control')&&workspaceId&&workspaceId.length<=1024)return {kind,workspaceId};
}

/** Transfer only the bitmap already read by the clicked attachment. */
export function requestDesktopImagePreview(source: string, name: string, signal: AbortSignal): Promise<boolean> {
  if ((!activeOverride && !desktopPage(location.hash.slice(1))) || signal.aborted || source.length > 12_000_000
      || !/^data:image\/(?:png|jpeg|gif|webp|avif|bmp);base64,/i.test(source)) return Promise.resolve(false);
  const id = crypto.randomUUID();
  return new Promise(resolve => {
    const finish = (opened: boolean) => {
      clearTimeout(timer);
      window.removeEventListener('buildr-dsh-read-preview', read);
      window.removeEventListener('buildr-dsh-host', reply);
      signal.removeEventListener('abort', abort);
      resolve(opened);
    };
    const abort = () => finish(false);
    const read = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.id === id) detail.image = { source, name: name.slice(0, 256), expiresAt };
    };
    const reply = (event: Event) => {
      const detail = (event as CustomEvent).detail?.imagePreview;
      if (detail?.id === id) finish(detail.opened === true);
    };
    const expiresAt = Date.now() + 1500;
    const timer = setTimeout(abort, 1500);
    signal.addEventListener('abort', abort, { once: true });
    window.addEventListener('buildr-dsh-read-preview', read);
    window.addEventListener('buildr-dsh-host', reply);
    desktopNotify({ kind: 'image-preview', id });
  });
}
