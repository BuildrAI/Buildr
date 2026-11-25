# 技术设计：双 DSH 插件隔离切换、元数据导出与自举包名迁移

## Context

- DSH 桌面 `app.asar` 中 `dsh-client-ui-layout` 声明 `main` 为 `keyed` 槽位、`shell.overlay` 为 `list` 槽位、`main.conversation` 为 `single` 槽位；`SlotCore.register` 对同 `priority` 的 `single` 槽位重复注册直接同步抛出异常。
- DSH 插件管理器 `readPluginMeta` 在不执行插件代码的条件下通过 Node ESM 解析 `<pkg>/locale/en.json`、`<pkg>/locale/*.json`、`package.json` 及 `<pkg>/icon`（或 `package.json#icon`），缺省 `locale` 时回退到 `package.json#name`。
- 本机自举配置文件 `~/.dsh/profiles/desktop/package.json` 当前持有旧包名 `@buildr-ai/buildr-harness-dsh-plugin-dev` 与 `@buildr-ai/buildr-development-dsh-plugin-dev`，且新旧包 `cordis.patch.yml` 使用相同条目标识（`buildr-harness-dev` / `buildr-development-dev`）。

## Decisions

1. **四通道独立的 `main.conversation` 优先级**
   - Harness 正式版 `-100`、开发版 `-101`；Development 正式版 `-102`、开发版 `-103`。
   - 即使旧插件或两个插件在相同事件循环中瞬间交叉占槽，也不会触碰同一优先级约束。
2. **微任务化的会话对齐与隔离发布**
   - 提取独立于 React 的 `createPanelController` 模块：
     - `publish()` 对每个订阅回调单独包裹 `try/catch`，单个订阅失败不阻断 `Shell` 重渲染；
     - `syncSlots()` 对 `main.conversation` 注入增加异常处理并用 `slotDispose.length > 0` 作为 `mountAvailable()` 条件之一；
     - `syncPanel()` 在激活时通过 `queueMicrotask` 调度 `align()`，避免在 `layout.panelInfo` 同步广播中途调用 `selectPanel(null)` 导致下游插件错过激活/失活信号。
3. **无副作用元数据生成模块**
   - 各自新增 `src/metadata.ts` 提供 `pluginPackageName`、`pluginLocales`、`pluginIconSvg`，由 `tools/build-dev.ts` 与测试直接消费，确保官方图标路径与 `client.tsx` 一致且满足 DSH <=256 KiB SVG 与受管导出要求。
4. **自举旧包名受控迁移**
   - 在 `dsh-development-plugin.mjs` 中为每个插件增加 `legacyNames`：若本机只安装了本工作空间发出的旧包且磁盘校验一致，则在安全停机换装阶段先执行 `dsh plugin --profile desktop remove <legacyName>`（必要时剔除残留 `dsh.profile.bundles`），再安装新包并校验回读；新旧并存直接 `blocked`。

## Risks / Trade-offs

- 移除旧包名再安装新包名会更新 `~/.dsh/profiles/desktop/package.json` 依赖键，但不影响用户在 `cordis.patch.yml` 中的其他自定义配置与 `localStorage` 绑定记录（`panelId` 与存储键保持不变）。
