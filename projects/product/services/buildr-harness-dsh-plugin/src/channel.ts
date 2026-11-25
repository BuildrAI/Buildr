/** Set by the immutable package build; raw source tests default to development. */
declare const __BUILDR_HARNESS_DSH_RELEASED__: boolean;
export const released = typeof __BUILDR_HARNESS_DSH_RELEASED__ !== 'undefined' && __BUILDR_HARNESS_DSH_RELEASED__;
export const label = released ? 'Buildr Harness' : 'Buildr Harness Dev';
export const panelId = released ? 'dsh-buildr-harness' : 'buildr-harness-dev';
export const ORDER = 10;
export const conversationPriority = released ? -100 : -101;
