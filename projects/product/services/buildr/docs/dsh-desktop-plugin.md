# DSH 桌面接入

Buildr 的智能体运行时适配器（Agent Runtime Adapter）管理 DSH 规则（Rule）与技能（Skill）投射，并协调独立桌面插件（Plugin）的交付维护。插件（Plugin）只提供入口、点击处理和右侧浏览器导航；Buildr 继续拥有安装身份、启动器（Launcher）、健康查询与业务数据。

## 支持边界

第一版在 macOS DSH 桌面版上验证通过；Windows 侧代码按 Buildr 自己声明的启动器约定分支，但**尚未在真实 Windows 主机验证**，不得据代码存在声称已支持。桌面必须提供官方已发布的侧栏底部动作席位（Seat）`sidebar.footer.action`：位于 Settings 旁，`replaceRisk: none`，由占位插件（Plugin）提供完整动作按钮，不要求注册主页面（Main Panel）。原始 `0.1.7-rc.2`（发布标签提交 `477b4f420553e8a52c2fbccc464d7561b239c443`）已经声明该席位，因此**不需要修改 DSH 源码，也不需要替换侧栏外壳**；插件对未修改的官方源码即可编译通过。

“新会话”之后、全局面板列表之前的位置需要额外席位 `sidebar.action`，它只存在于候选补丁 `tools/dsh/patches/` 中，采用它需要自建 DSH 并替换当前桌面应用。本版不采用该路径；插件源码与该位置无关，回归时可整体迁移。

网页版使用内嵌框架（iframe），不是本次支持目标。Buildr 的 `frame-ancestors 'none'` 和 `X-Frame-Options: DENY` 保持不变，插件（Plugin）不会从 DSH 来源（Origin）代发业务写请求或向页面传递内部密钥。

## 源资产与构建

- 插件（Plugin）源资产在 `resources/runtime/dsh/`，由 Buildr 服务（Service）维护。
- 工程工具在 `tools/dsh/`；候选位置 `sidebar.action` 的 DSH 源码补丁与精确验证说明保留在 `tools/dsh/patches/`，当前交付不依赖它。
- 编译产物在被忽略的 `build/dsh-plugin/`（正式版）与 `build/dsh-plugin-dev/`（开发版），不作为源资产提交。
- 构建依赖明确的 DSH 软件开发工具包（SDK）源码与其构建前置产物；运行插件（Plugin）的目标机器不应依赖开发检出目录。构建不会自行启动 DSH 或执行依赖安装脚本。

```sh
node tools/dsh/build-plugin.ts <verified-dsh-sdk-checkout>          # 正式版
node tools/dsh/build-plugin.ts <verified-dsh-sdk-checkout> --dev    # 开发版入口
```

开发维护者按产品固定 Node 版本执行，核对精确 DSH 基线与相关测试。未绑定产物不是已经安装的插件（Plugin）。既有生成物集合接受显式 `dshPluginRoot`，冻结载荷构建相应接受 `--dsh-plugin <unbound-bundle-dir>`，逐文件校验同一清单后放入 `product/build/dsh-plugin`；拒绝原始 TypeScript 和已绑定本机配置。未提供该可选输入时不隐式扫描旧构建目录，也不把 DSH 软件开发工具包（SDK）变成普通 Buildr 构建的前置条件。缺少编译产物时应明确报告；正式 Buildr 包是否包含该产物必须按实际打包输入说明，不能仅依据资源目录存在作承诺。

**当前正式候选链路尚未传入该输入，因此正式包实际不含插件产物。** 发布形态、补齐顺序与 DSH 版本跟随边界见[DSH 插件发布与维护流程](../../../knowledge/docs/flows/dsh-plugin-release.md)；在该缺口补齐前，可用交付路径是仓内构建加用户侧安装，不对外声明稳定版已随包提供插件。

## 两种入口，两个包

同一份代码构建出两种包，差别只在构建期身份；任何一方都不需要在运行时选择安装：

| | 正式版 | 开发版 |
|---|---|---|
| 包名 | `@buildr-ai/dsh-plugin` | `@buildr-ai/dsh-plugin-dev` |
| 打开 | 正式版 Buildr（npm 安装） | Buildr 开发版源码 |
| 补丁层 | `cordis.patch.yml` | `cordis.dev.patch.yml` |
| 入口标识 | `buildr` | `buildr-dev` |
| 分发 | npm 包、代码仓库或本地归档 | 只在开发者机器上单独构建，不随正式发布 |

包名决定它服务哪一份安装（`channelForPackage`），因此**没有渠道参数、没有渠道选择**。两者可以同时装在一个 DSH profile 里，各自一个入口，互不回落。

## 构建

```
node tools/dsh/build-plugin.ts <sdk-dir>          # 正式版 → build/dsh-plugin
node tools/dsh/build-plugin.ts <sdk-dir> --dev    # 开发版 → build/dsh-plugin-dev
```

## 自动发现，没有登记步骤

插件不要求用户登记本机 Buildr：第一次打开时，宿主侧按顺序发现——

1. 读 **Buildr 自己的安装登记表**（`product-installations.json`，平台状态根与 Buildr 公开状态一致），取其中的 npm 安装入口；
2. 读不到时，从**运行本插件的 Node** 推出 npm 全局模块目录，读包清单声明的 `bin.buildr`。

两条都不成立时才报告“没有检测到 Buildr”。**不使用 PATH 探测**：桌面应用常继承精简 PATH，`buildr` 未必可见。发现结果只缓存于本次插件生命周期，不写盘。

发现到的信息只有两个路径：Node 可执行文件与 Buildr 入口。配置里可选的 `binding` 供显式指定用，正常安装不需要提供。

## 点击行为

存在可用对话会话（Session）时，第一次点击通过宿主读取公开健康状态。仅目标渠道、安装与运行环境身份一致且 `status === "ready"` 时返回地址；未运行时执行已绑定的既有启动器（Launcher），子进程独立设置 `BUILDR_LAUNCHER_NO_OPEN=1`，随后有界等待真实就绪。默认总等待 30 秒；同一轮并发点击共享启动操作。

当前插件（Plugin）生命周期内，每次有效点击仍会通过公开健康查询确认地址；地址不变时只展示已由本插件（Plugin）打开的页面，不再次导航或刷新。地址变化时保留旧页面及其未保存内容，另开健康查询返回的新地址，并将后续重复点击指向新页；等待中被用户关闭的旧页不会被自动重开。当前不会读取宿主私有缓存来复认旧页面，因此禁用后重启用、客户端重载或重启后的首次点击可能新建标签页；旧页面不会被本插件（Plugin）强制关闭。这一限制不能被描述为跨重启页面复用已经完成。没有可用会话（Session）、运行于网页版、启动失败、超时或安装漂移时给出明确反馈；不会偷偷创建对话、向智能体（Agent）发消息或切换中间主页面。插件（Plugin）禁用时停止自己的等待与监听，不终止已运行的 Buildr Web。

## 更新与恢复

Buildr 的安装入口或启动器（Launcher）升级后，由智能体（Agent）重新准备新私有目录，再通过 DSH 自身管理机制更新；旧绑定的摘要漂移不得被静默忽略。用户限定“只更新命令行接口（CLI）”时，不追加插件（Plugin）写入；原先禁用的插件（Plugin）不得被维护过程擅自启用。

禁用保留安装与页面，卸载只删除 DSH 组合包及其贡献，不删除 Buildr 数据或停止 Web 服务。恢复使用同一已核实安装重新准备与安装，按管理结果核对是否需要重启。当前管理工具不可用时明确报告，不伪造自动安装能力。

## 验证分层

源代码测试、编译、私有绑定准备、安装、客户端激活和真实桌面验收是独立结果。至少实际核对指定位置、原生外观、中间对话保留、正确渠道复用与静默启动、地址变化、重复点击、无会话（Session）、失败重试、禁用卸载，以及 Buildr 页面正常导航；任何业务写入使用隔离数据。文件投射通过也不表示 DSH 已真实加载规则（Rule）与技能（Skill）。
