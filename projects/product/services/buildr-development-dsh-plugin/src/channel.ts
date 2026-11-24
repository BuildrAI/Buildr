declare const __BUILDR_DEVELOPMENT_DSH_RELEASED__: boolean | undefined;

export const released = typeof __BUILDR_DEVELOPMENT_DSH_RELEASED__ === 'boolean'
  ? __BUILDR_DEVELOPMENT_DSH_RELEASED__
  : false;
export const panelId = released ? 'dsh-buildr-development' : 'buildr-development-dev';
export const label = released ? 'Buildr Development' : 'Buildr Development Dev';
export const ORDER = 11;
