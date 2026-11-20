import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('全屏设置样式采用保留左导轨的两级左侧导航并隐藏分栏对话列表', () => {
  const focusCss = read('../../src/features/agent-conversations/focus-settings.css');
  const [desktopCss, mobileCss = ''] = focusCss.split('@media(max-width:760px){');
  const dockCss = read('../../src/features/agent-conversations/conversation-dock.css');
  assert.match(desktopCss, /\.ac-focus-settings\{[^}]*display:flex/);
  assert.doesNotMatch(desktopCss, /\.ac-focus-settings\{[^}]*flex-direction:column/);
  assert.match(mobileCss, /\.ac-focus-settings\{[^}]*flex-direction:column/);
  assert.match(desktopCss, /\.ac-focus-settings-nav\{[^}]*background:#f2f5f4/);
  assert.match(desktopCss, /\.ac-focus-settings \.amm-source-list\{[^}]*background:#f8faf9/);
  assert.match(desktopCss, /\.ac-focus-settings-body\{[^}]*max-width:920px[^}]*margin:0/);
  assert.match(dockCss, /\.ac-focus-history-pane\[hidden\]\{display:none!important\}/);
});

test('设置界面收口为「设置」，一级菜单不加箭头并支持 Escape 与关闭按钮退出', () => {
  const settingsSource = read('../../src/features/agent-conversations/AgentConnectionSettings.tsx');
  const setupSource = read('../../src/features/agent-conversations/AgentModelSetup.tsx');
  const panelSource = read('../../src/features/agent-conversations/ConversationPanel.tsx');
  assert.match(settingsSource, /<h1 id="agent-focus-settings-heading">设置<\/h1>/);
  assert.match(settingsSource, /title="设置"/);
  assert.match(settingsSource, /closeAriaLabel="关闭设置"/);
  assert.match(settingsSource, /aria-label="关闭设置"/);
  assert.match(settingsSource, /event\.key!=='Escape'/);
  assert.doesNotMatch(settingsSource, /RightOutlined|ArrowLeftOutlined|智能体与模型|返回对话/);
  assert.match(setupSource, /hideModeTabs=false/);
  assert.match(panelSource, /hidden=\{showFocusSettings\}/);
  assert.match(panelSource, /!showFocusSettings&&<SplitDivider/);
});

test('全屏设置期间左导轨保持唯一设置入口高亮且点击当前对话或列表可安全退出设置', () => {
  const surfaceSource = read('../../src/features/agent-conversations/ConversationDockSurface.tsx');
  const dockSource = read('../../src/features/agent-conversations/ConversationDock.tsx');
  const activitySource = read('../../src/features/agent-conversations/ConversationActivity.tsx');
  const quotaButtonSource = read('../../src/features/agent-conversations/AccountQuotaButton.tsx');
  assert.match(surfaceSource, /aria-label="设置" title="设置"/);
  assert.match(surfaceSource, /open&&view==='conversation'&&!settingsActive/);
  assert.doesNotMatch(surfaceSource, /智能体与模型设置/);
  assert.match(dockSource, /if\(focusSettings&&context\.settings\)\{context\.setSettings\(false\);return;\}/);
  assert.match(activitySource, /if\(context\.full&&context\.settings\)\{context\.setSettings\(false\);if\(context\.view!=='history'\)context\.openHistory\(null,\{preserveVisibility:true\}\);return;\}/);
  assert.match(activitySource, /context\.open&&context\.view==='history'&&!\(context\.full&&context\.settings\)/);
  assert.match(quotaButtonSource, /dedicated\?'供应商额度':'设置'/);
});
