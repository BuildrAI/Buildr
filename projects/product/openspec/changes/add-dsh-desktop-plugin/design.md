## Context

本任务是实施请求，已经取得隔离开发与相关测试授权。核实当前版本的扩展边界后，用户已选择“增加 DSH 正式扩展点”：允许在独立正式源码中增加最小动作席位（Slot）与测试，不替换整段侧栏、不修改当前应用安装包，不启动另一 DSH 冒充验收。当前桌面采用新构建或重启仍需说明影响并由用户安排。

- 已核对 Buildr 产品代码；最新 `dev` 已把 `dsh` 登记为有效运行时标识并映射到标准适配器 `agents-standard`，构建已包含该适配器。
- 已核对当前 DSH 组合包版本为 `0.1.7-rc.2`，侧栏构建标记为 `c127551`。安装内容来自归档的只读副本，未改动原始应用。
- 实时检查（Inspect）确认 `sidebar.panellist` 是全局主页面图标列表，唯一现有条目是 `plugins`，不是动作列表。

## Goals / Non-Goals

**Goals:**

- 保留中间对话，通过指定位置的 Buildr 按钮复用或启动准确安装，并在右侧内置浏览器展示已有页面。
- 以 Buildr 现有公开状态与启动能力完成薄接入，分开说明插件（Plugin）和智能体运行时适配器（Agent Runtime Adapter）的交付状态。
- 维护可升级的产品源资产、受支持安装路径和可验证失败边界。

**Non-Goals:**

- 修改本机 DSH 安装归档、私有受管配置、安全响应头或真实业务数据。
- 新增同步、调度、通用管理框架或把正式版重新绑定到开发源码。
- 用静态分析、安装或文件投射冒充真实桌面及会话（Session）验收。

## Decisions

### 1. 改判：官方发布版本已提供动作席位，无需修改 DSH

当前安装包中，`@deepseek-ai/dsh-client-ui-sidebar/lib/client.js`：

- `PanelRow` 在第 173–199 行拥有外层按钮，第 184–186 行固定调用 `selectPanel(id)`；`sidebar.panellist` 第 190–193 行只占据 `aria-hidden` 图标区域。
- 第 353–394 行从“新会话”直接进入面板行，没有夹在二者之间的动作席位（Slot）。
- 第 491–525 行由原侧栏条目一次性声明**八个**子席位（Slot）：`sidebar.brand.mark`、`sidebar.brand.name`、`sidebar.toggle.badge`、`sidebar.panellist`、`sidebar.workspaces`、`sidebar.settings`、`sidebar.footer.action`；第 534–535 行只导出 `apply` 与 `inject`。此前记录“七个子席位且没有动作席位”是漏查，实际第八个 `sidebar.footer.action` 就是官方已发布的动作列表席位。
- 同包在 `renderSlot('sidebar.footer.action', { wide })` 渲染该席位（位于 `footArea` 的 `footerActions`，紧邻 `sidebar.settings`），并在 `contract/slots.ts` 声明 `kind: 'list'`、`scope: 'root'`、`owner: SidebarFooterActionOwnerProps`；`replaceRisk: none`，文档示例即为插件注册一个自带按钮的条目。官方发布标签 `477b4f42` 的明文 HEAD 已包含该声明，本任务补丁不涉及它。
- 同包 `README.zh.md` 第 68 行明确侧栏外壳与行组件封装于注册内部，不提供伴生组件入口。

其他正式组合机制仍不能透明包裹原实现（因此不采用）：

- `dsh-client-ui-renderer/lib/client.js` 第 1148–1152 行，单一席位（Slot）仅渲染当前获选条目；无 `original`、`next` 或 `wrap` 渲染契约（Contract）。
- 同文件第 1506–1509 行，根上下文只允许渲染 `root`；不能从插件（Plugin）中随意渲染 `sidebar` 的原占用者。
- `dsh-client-ui-slots/lib/index.js` 第 191–194 行拒绝重复子席位（Slot）声明，因此覆盖外壳时不能直接重声明仍由原外壳拥有的子席位（Slot）。
- `entries` / `entriesOfSlot` 是渲染擦除的检查视图，不是已公开的组件包裹契约（Contract）；正式服务（Service）编码契约（Contract）仅提供 `register`、`registerFactory`、`inject`。不把内部组件指针抓取、注入结果篡改或猴子补丁当正式扩展。
- 组件工厂（Factory）机制支持局部组合，但当前侧栏没有声明可替换的外壳或面板行组件工厂（Factory）。

实测还确认：该席位只下发 `{ wide }`；主页面选择经全局标准属性 `GlobalStandardProps.usePanelInfo`（由布局包声明，对所有席位可用）读取，因此插件无需额外注入。对未修改的官方提交 `477b4f42` 工作区，插件源码编译、打包、真实加载器挂载与 React 渲染均已通过（`tools/dsh/verify-plugin.ts`）。

### 2. 位置取舍与替代方案

**当前交付：官方 `sidebar.footer.action` 席位（Settings 旁）。** 零 DSH 改动，可直接安装在现有桌面版；与最初指定的“新会话下方、插件上方”不是同一位置，必须在交付与验收中如实标注，不得描述为原位置已实现。

**可选升级路径：官方源码新增 `sidebar.action` 席位。** 位于“新会话”之后、现有面板行之前，复用原行外观与键盘反馈；影响限制为侧栏声明、局部渲染与测试，不改 `selectPanel`、中间主页面、工作空间浏览或右侧浏览器。采用它需要自建并签名相应用户桌面应用（当前环境缺 Electron 打包与签名前置，且会替换正在使用的应用），需用户明确安排。补丁与测试保留在 `tools/dsh/patches/`。

**备选：版本锁定的侧栏外壳替换插件（Plugin）。** 通过 DSH 自身机制替换内置侧栏外壳，重新承担品牌行、新会话、面板导航、收起动画、macOS 窗口控制、快捷键提示、滚动条反馈及八个子席位（Slot）声明与生命周期；工作空间树和设置内容可继续使用原有功能插件（Plugin）。这不是只添加一个按钮，需明确授权后实施，并对这些既有功能补充回归与升级核对。

**不采用：** 在图标内部嵌入交互按钮并拦截冒泡、依赖文档对象模型（DOM）结构移动元素、先选假主页面再切回、把条目伪装成主页面图标。

### 3. 插件与 Buildr 职责保持薄边界

取得可行入口后，宿主侧只运行接入绑定的安装入口，读取 `installation status --json` 的准确渠道和健康身份；目标未运行时才以 `BUILDR_LAUNCHER_NO_OPEN=1` 调用既有启动器（Launcher），有界等待后返回健康地址。界面侧只处理会话（Session）可用性与右侧浏览器复用，不获得内部密钥。

首次打开与再次展示必须分别处理：再次展示已有页面不导航、不刷新；异步启动结束时重验当前会话（Session），不能把页面打开到已切换的错误上下文（Context）。这些行为尚未实现或实测，不先承诺宿主具备所有页面复用能力。

### 4. 安装维护与完整适配分开

已确认 DSH 有公开 `plugin_manager` 工具、`ctx.pluginManager` 服务（Service）及 `dsh plugin --profile ...` 命令路径；桌面受管安装须使用 DSH 管理机制，不能直接执行包管理器改写配置。管理变更影响同一配置档（Profile）的全部会话（Session），且替换已加载的软件包可能要求重启；安装成功不等于客户端激活成功。

独立 DSH 描述符（Descriptor）的方案已作废：最新 `dev` 已归档标准适配器（Standard Adapter）变更，`dsh` 作为真实运行时标识映射到 `agents-standard`，规则（Rule）与技能（Skill）投射到 `.agents` 标准位置，并有测试断言不存在独立 `dsh` 适配器（Adapter）。插件交付保留 DSH 特有部分，规则与技能不再由本任务新增适配器承载。

## Risks / Trade-offs

- 采用官方已发布席位不需要构建或升级 DSH，但位置是“Settings 旁”的侧栏底部，与最初指定的位置不同；该差异必须在交付与验收中如实标注。
- 若要回到“新会话下方”的位置，需要自建并签名 DSH 桌面应用并替换当前应用，属于需要用户明确安排的独立决定；不能以同版本号声称兼容。
- 外壳替换不修改应用安装包，却扩大了跨版本回归面；仅锁定版本不能代替真实桌面测试。
- Buildr 禁止内嵌框架（iframe）的安全头必须保留，网页视图（WebView）加载仍需实际验证。
- 右侧栏依赖已挂载对话；无会话（Session）只能明确提示，不能偷偷创建或发送消息。
- 源码、隔离测试、产物准备、安装和真实桌面验收分别记录；前三者成立不能替代后两者。真实桌面上的按钮位置、外观与点击行为仍未验收。
