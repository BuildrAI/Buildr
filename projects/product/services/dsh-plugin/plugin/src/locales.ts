/** Plugin-owned UI copy. */
export const zh = {
  title: 'Buildr', titleDev: 'Buildr 开发版', open: '打开 Buildr', loading: '正在准备 Buildr…', retry: '重试打开 Buildr',
  openDev: '打开 Buildr 开发版',
  noSession: '请先选择已有对话，再打开 Buildr；不会自动创建会话。',
  desktopOnly: '需要 DSH 桌面内置浏览器；网页版不支持此入口。',
  sessionChanged: '当前对话已变化。请在目标对话中重新点击 Buildr。',
  tabClosed: '原 Buildr 页面已关闭，本次不会重新打开；需要时请再次点击 Buildr。',
  failed: 'Buildr 未能打开，请重试。',
  incompatible: 'Buildr 需要提供侧栏底部动作席位（sidebar.footer.action）的 DSH 版本；当前入口尚不可用。请升级兼容版本，不会替换侧栏。',
} satisfies Record<string, string>;
export type BuildrKey = keyof typeof zh;
export const en = {
  title: 'Buildr', titleDev: 'Buildr (development)', open: 'Open Buildr', loading: 'Preparing Buildr…', retry: 'Retry opening Buildr',
  openDev: 'Open Buildr (development)',
  noSession: 'Select an existing conversation first. Buildr will not create a session.',
  desktopOnly: 'The DSH desktop browser is required; this action is unavailable on the web.',
  sessionChanged: 'The conversation changed. Click Buildr again in the intended conversation.',
  tabClosed: 'The previous Buildr page was closed. This request will not reopen it; click Buildr again when needed.',
  failed: 'Buildr could not be opened. Please retry.',
  incompatible: 'Buildr requires a DSH version with the sidebar foot action seat (sidebar.footer.action). Upgrade to a compatible version; the sidebar will not be replaced.',
} satisfies Record<BuildrKey, string>;
