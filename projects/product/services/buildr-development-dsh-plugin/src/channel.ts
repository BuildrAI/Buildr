declare const __BUILDR_DEVELOPMENT_DSH_RELEASED__: boolean | undefined;

export const released = typeof __BUILDR_DEVELOPMENT_DSH_RELEASED__ === 'boolean'
  ? __BUILDR_DEVELOPMENT_DSH_RELEASED__
  : false;
export const panelId = released ? 'dsh-buildr' : 'buildr-dev';
export const label = released ? 'Buildr' : 'Buildr Dev';
export const ORDER = released ? 6 : 7;
export const conversationPriority = released ? -102 : -103;
