# Buildr DSH 插件独立发布

DSH（DeepSeek Harness）插件（Plugin）由独立服务（Service）[插件服务](<../../../services/dsh-plugin/plugin/README.md>) 维护。Buildr 主包不再包含插件包，也不要求软件开发工具包（SDK）作为主包候选输入。插件版本只在插件源码、兼容基线或交付契约变化时更新；Buildr 主包单独变化时复用已公开的插件版本。

## 版本与候选

插件（Plugin）保持独立版本，在插件服务根目录使用[项目 Node 版本声明](<../../../.node-version>)对应运行环境。发布准备显式消费已核验的源码软件开发工具包（SDK），查询与打包不使用本机 npm 认证配置：

```sh
node tools/release.ts status
node tools/release.ts prepare --source-sdk <prepared-source-sdk>
```

`status` 对照插件版本、最近的 `dsh-plugin-v*` 标签（Tag）、插件服务路径的源码变化和 npm 注册表（Registry）的公开版本，给出 `not-public`、`changes-pending` 或 `up-to-date`。注册表（Registry）查询失败会报错，不推测“已发布”。准备要求源码已提交且该版本尚未公开，依次构建、用真实 DSH 装载器（Loader）验证和压缩。`build/release-candidates/<version>/candidate.json` 记录准确提交、服务源码树、软件开发工具包（SDK）的基线与补丁摘要、相对压缩包名、大小、SHA-256 和 npm 完整性（Integrity）；候选目录已存在时拒绝覆盖。将说明和原压缩包整体搬运后仍须验证同一字节，发布不重新打包。本次代码交付不证明公开候选或 npm 版本已生成。

压缩包必须只含预编译插件、默认启用的组合补丁和许可文件，不含本机路径、凭证或安装脚本。正式版包名是 `@buildr-ai/buildr-dsh-plugin`。开发版变体 `@buildr-ai/buildr-dsh-plugin-dev` 仅在开发者机器构建、安装，不公开发布。

## 当次来源采集的精确构建输入

下文 `services/dsh-plugin/build/` 中的证据文件属于原验证现场的本机临时产物，不随源码交付，也不保证在其他检出位置可读；文件名仅保留为现场定位信息。已入库的验证范围与结果以[实施记录](<../../../openspec/changes/archive/2026-10-05-add-dsh-buildr-provenance/implementation-progress.md>)为长期入口，不能用不存在的本机文件作为当前验证证明。

2026-10-05 确认改为当次采集（Capture）及原事件直接读取。选定主机端（Host）生产者在真实规则注入、技能胜出读取和受支持能力／子调用现场写 `dsh.event-sources/v1`：工具事件使用 `data.eventSources`，规则注入使用 `message.source.eventSources`。原会话（Session）保存重载及查询保全，客户端（Client）上下文透传小元数据（Metadata）。原七类型、正文、调用结果、顺序与模型文字保持，不另造流水或在事件顶层加字段。

原来源列、原详情和 Buildr 标签读取同一当次标记（Source Marker），标签只保留 `confirmed` 且 `providedBy=buildr` 的原记录。无字段为未采集；未知、不适用和候选不入主列表。查看时不查询当前资产或安装，也不按名称、目录和旧绑定补历史；仅明确选择时以原事件地址读取实际内容。正文使用原内容块 UTF-16 半开片段引用，Buildr 管理的用户资料不因此归为自身来源。实现与边界见[插件说明](<../../../services/dsh-plugin/plugin/README.md>)与[本轮待验清单](<../../../openspec/changes/archive/2026-10-05-add-dsh-buildr-provenance/tasks.md>)。

采集提供者（Capture Provider）使用 Buildr 公有 `source inspect` 的 `mode: metadata` 核对实际原始摘要及资产依据，不发普通用户正文，不返回当前／观察正文；默认 `mode: content` 保持公开接口兼容。服务端仍可能读自身资产核对，查看路径完全不调用该 API。默认 `content` 的解析兼容已有单元验证，采集摘要与混合／遮蔽边界另有受控检查，默认正文兼容的集成用例未冒称本轮执行通过。来源确认与执行成功分开，命令解释器（Bash）前台正规化的 `execution.outcome`／`exitCode` 同期保存；后台未知、原生失败优先，不由查看端解析输出猜成功。

新[事件来源补丁清单](<../../../services/dsh-plugin/sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.json>)使用 `buildr.dsh-source-patch/v2`，固定官方基线 `639ed015397290b3745d163aafe02ffee4aa3f84`、逐文件摘要及八个选定生产者包。现装构建 `5e9e301dd9dc8923b2762f76dacfc5751f6ca851` 不同，版本号不能替代现装兼容与实际保存重载验证。旧 v1 显示补丁和 SDK 保留原字节与边界，不因新材料升级为采集证据。

[准备器](<../../../services/dsh-plugin/tools/prepare-source-sdk.ts>)在独占输出中重建源码，生成真实声明和轨迹产物，并将选定生产者以共享模块图编译为实体主机端（Host）包，保留公开名称。新 `buildr.dsh-source-sdk/v2` 就绪回执（Receipt）核对源码、声明、API 探针及全部 Host 实体摘要；非选定 Session／LLM 运行时（Runtime）外置至现装库，不能绕过原共享契约。

```sh
node tools/prepare-source-sdk.ts --source <exact-upstream-checkout> --manifest sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.json --node <selected-compatible-node>
node tools/build-plugin.ts --source-sdk <prepared-source-sdk> --output <owned-candidate-root>
node tools/verify-plugin.ts --source-sdk <prepared-source-sdk> --bundle <owned-candidate-root>
node tools/build-development-composition.ts --source-sdk <prepared-source-sdk> --entry <exact-dev-bundle> --source-cli <explicit-source-cli> --node <selected-compatible-node> --host-config <observed-host-config.json> --output <new-owned-output>
```

新私有开发组合（Composition）仅停换实际激活的三个根服务，同图五个模块保留给真实预设（Preset）使用。`--host-config` 保全原始配置／条件／注入及观察事实，不回填解析默认值、不强开根层停用五行。公有配置编辑器（ConfigEditor）在锁内比较最新实际声明，只改五个唯一模块地址，保留所有其它DSL、配置、隔离、权限和身份；候选不复制完整预设或凭证。编辑完成后另查当前版本无 `broken`、适用行运行状态及真实新来源；仅预设（Preset）叶更新且原 `AgentLoop` 未卸载时，旧智能体（Agent）保留已绑定版本，不绕非空重组限制。本次三个根服务停换触发热重载（HMR），释放旧 `AgentLoop` 拥有的运行智能体并从列表撤下；该停换阶段先由公开元数据（Metadata）核对原会话（Session）持久存在，后续已通过受支持恢复入口核对原会话可用；恢复可合法追加结束记录，不承诺原日志字节不变，范围见实施索引。撤回先比较并恢复五叶、验证恢复可用，再移除图；用户变化不覆盖。构建不证明这些运行义务完成。

阅读优化前的采集现场：精确 `f3b934`／`WC8mR4` 组合已通过官方入口安装，`runtime-entry-c2f1a25bb563a49d` 已冷启动激活；三个根服务（Root3）及 standard／ptc／cordis 共十五个私有模块配置和运行状态已核对，保持同一 `774a` 图。随后 95 个事件中有 11 个保存来源字段，原生窗口（Native Window）显示五条已确认 Buildr 记录：规则注入、规则读取、技能加载，以及命令行（CLI）成功／失败各一条。成功事件 `seq: 84` 同期 `exitCode: 0`，失败事件 `seq: 89` 同期 `exitCode: 1`；两者来源均为 `confirmed`，各保留一个必要目标引用，均无正文引用，原失败结果的 `isError: false` 保持。普通 README 读取 `seq: 38` 排除。 本轮软件开发工具包（SDK）`B1UEnW` 和 106 文件补丁 `4e7b3d` 保持不变；项目 Node 声明为 `24.15.0`，195 项 Node、12 项原界面受控检查及两种实际装载器（Loader）检查通过。

这 95 个事件经同一主机端（Host）的原查询、原事件读取、持久读取及两个只读句柄重开保持一致，12 项检查通过，原历史来源、模型／请求及工具元数据（Metadata）保全。实际技能加载的原事件正文已可见，技能文件正文读取样本仍为零。原调用跳转、来源列及详情、两条能力过滤、关闭后全宽／回焦与搜索保留、清搜索不重开已在原生界面（Native UI）验证。该同Host回执本身没有释放智能体（Agent）或重启Host；随后正常整应用退出／重启已另证95原前缀来源／工具／请求保持，恢复总数96，原查询／存储及重开通过。此新证据与此前配置冷启动分开，不声称总数不变，也不核销扩展矩阵。 证据见95 事件元数据回执（本机临时证据：`services/dsh-plugin/build/capture-session-observed-0104a5f0-8c02-41c0-afcd-8e71c560dd77.json`）及当前原生验证（本机临时证据：`services/dsh-plugin/build/capture-source-native-current-before-cold.json`）。精确双客户端（Client）的WC8 浏览器证明（本机临时证据：`services/dsh-plugin/build/source-ui-browser-WC8mR4-input-proof-0e4dda9d.json`）和七类伴随证明（本机临时证据：`services/dsh-plugin/build/source-seven-kinds-companion-20261005-ed633e8b/browser/seven-kind-result.json`）以及原接口双页证明（本机临时证据：`services/dsh-plugin/build/source-pagination-companion-20261005-53f4c8d1/pagination-result.json`）覆盖受控渲染与内存存储上的原控制器／组装接口，不代表原生分页按钮、JSONL 后端分页、真实子动作或跨平台验证。历史构建、互操作失败、恢复及安装仍见[实施索引](<../../../openspec/changes/archive/2026-10-05-add-dsh-buildr-provenance/implementation-progress.md>)；平台严格读取边界见[插件说明](<../../../services/dsh-plugin/plugin/README.md#严格来源文件读取的平台边界>)。这些结果不代表公开发布或父观察体系完成。

## 原安装器的 Buildr 互斥检查

一个 DSH 配置档（Profile）同时只安装一个 Buildr 插件（Plugin）。正式包、开发包、本机开发组合和旧开发包的真实身份共同受检，停用仍算已安装。原插件安装页提示用户先卸载；安装与更新在同一写锁内复查，不自动停用、卸载或替换。已识别的无关包保持原行为。实现与精确输入见[安装检查交付边界](<../../../services/dsh-plugin/sdk-patches/README.md#buildr-插件安装检查>)。

打开入口的源码修正由 Buildr 主体分别报告开发程序健康与当前源码匹配；仅为同一开发渠道不能证明当前版本。自动发现的查询入口失效可以共享一次重新发现，显式绑定和启动器故障不会触发改绑。安装器的源码修正贯穿取消与期限、保留版本不变的正常恢复，并统一别名真实目标。两处构建输入仍分别核验，模块回归、插件构建与装载通过不表示日常桌面已采用这些后续修正。

独立 Buildr 包没有安装前拦截接口，这项检查需要 DSH 原安装器（Installer）及完整运行时（Runtime）一起更新，不随单独的插件（Plugin）发布自动生效。本轮保存独立增量源码补丁（Source Patch）与完整 DSH 候选；按用户另行批准，已安全撤回本机当前开发组合并卸载旧版本，采用同源日常开发载体、实际安装唯一新开发版。日常原安装页和原官方命令行（CLI）均拒绝第二个 Buildr 且保持四个配置文件；原十条来源与新增成功命令在正常重启后均保持，开发版组件仍运行，原模型、凭证及无关插件保全。本机开发构建不代表厂商签名发行版或公开发布。插件（Plugin）装载器（Loader）的两变体命名空间隔离检查只证明直接装载不冲突，不代表安装共存策略。

本机增强开发组合的普通卸载尚不会自动恢复十五个预设（Preset）引用；切换前须完成下文已有完整撤回步骤。本轮不实现自动撤回，不能以安装检查通过证明卸载安全。历史共存现场保留为旧版本事实。

## 发布与安装

公开 npm 发布和 `dsh-plugin-v<version>` 标签属于插件自己的版本事实，需针对准确版本、源码和同一候选字节单独取得发布授权。候选生成不等于公开发布。发布失败、尚未授权或注册表仍不可见时，不能承诺用户已经能一句话安装。

独立[发布工作流（Workflow）](<../../../../../.github/workflows/publish-dsh-plugin.yml>)只接受 `workflow_dispatch`，不因提交、Buildr 主包发布或标签（Tag）自动发布插件。默认 `operation=prepare`，`version` 必须与服务 `package.json` 相同，不修改版本。准备运行限定 `main`，固定 GitHub 托管执行器（Hosted Runner）、Node `24.15.0`、pnpm `11.7.0`，由[固定准备入口](<../../../services/dsh-plugin/tools/prepare-release-sdk.ts>)取得真实上游 Git 检出 `deepseek-ai/deepseek-harness` 的 `639ed015397290b3745d163aafe02ffee4aa3f84`，验证并应用入库补丁，按补丁后的锁文件冻结安装，再重建源码软件开发工具包（SDK）。完整检查覆盖正式版、开发版及真实装载器（Loader），只上传 `candidate.json` 和原压缩包。

完整检查还会在隔离环境调用当前检出的 Buildr 源码命令行（CLI），验证来源绑定与实际读取。执行前通过[准备声明（Preparation Declaration）](<../../../preparation.yml>)的 `buildr.npm-ci` 准备 `services/buildr` 锁定依赖；独立工作流（Workflow）按同一 `package-lock.json` 隔离执行 `npm ci --omit=dev --ignore-scripts`，只安装所需运行依赖（Runtime Dependencies）。这项准备不生成 Buildr 主包候选（Candidate）、修改主包版本或执行主包发布。

另一运行选择 `operation=publish`，填写同一 `main` 提交的成功准备运行编号 `candidate_run_id`，在 `npm-production` 中审批。只有该发布作业（Job）授予 `id-token: write`；[插件发布器](<../../../services/dsh-plugin/tools/trusted-publish.ts>)验证真实开放身份连接（OIDC）与包的 npm 信任，隔离用户／全局 npm 配置及长期认证环境，再发布原压缩包。不提供本机令牌（Token）回退，不读取或修改现有凭据。主包的 `publish.yml` 身份不能用于插件。

发布前完整查询同版本历史运行和每次尝试；尚未进入发布步骤的已完成失败可另启新运行。已进入发布、被取消或结果不明时，必须填写最新该次 `recovery_run_id` 并下载 `plugin-publication-v<version>` 的 `publication.json`。该证据记录原请求身份与候选摘要；已公开相同完整性（Integrity）直接复用，前次可能已派发而注册表（Registry）仍缺失或未知时只回读，不重复发送。缺少证据、原提交不符或历史查询不完整就停止相关发布；本工作流不支持点击重新运行，恢复使用新的手动运行。证据保留 90 天，过期前须保全必要证据；候选和发布证据缺失不自动重建或重发。

npm 网站需为 **`@buildr-ai/buildr-dsh-plugin` 单独配置可信发布者（Trusted Publisher）**：

| 字段 | 精确值 |
| --- | --- |
| 提供者（Provider） | GitHub Actions |
| Organization or user | `BuildrAI` |
| Repository | `Buildr` |
| Workflow filename | `publish-dsh-plugin.yml` |
| Environment name | `npm-production` |
| Allowed actions | `npm publish`（须明确允许直接发布） |

正式包的 `repository.url` 对应 `git+https://github.com/BuildrAI/Buildr.git`。现有主包绑定不证明插件已配置。已只读观察到 GitHub 环境要求 `elevenching` 审批、允许自审且没有部署分支规则；工作流自身仍校验 `main`，发布前重新核对平台现状。本次不修改信任或保护，也不执行公开发布和标签（Tag）写入。

依 npm [可信发布说明](https://docs.npmjs.com/trusted-publishers/)，新绑定需在 48 小时内成功发布验证，宜在准确版本已获准发布且候选可用时配置。若包尚未存在，可另行授权通过 npm [暂存发布（Staged Publishing）](https://github.blog/changelog/2026-10-02-npm-staged-publishing-now-supports-creating-new-packages/)使用短期登录会话（Session）创建首个包并审批；该首次设置不要求保留长期令牌（Token）。这些平台动作须独立确认，代码和配置文件存在不证明当前绑定已生效。确认其他用途均已迁移后，才另行决定移除或撤销旧凭据。

公开后，智能体（Agent）在目标 DSH 配置档（Profile）中使用受支持入口安装 `@buildr-ai/buildr-dsh-plugin`。`desktop` 仍由 Electron 桌面应用管理；当前已安装官方桌面运行时（Desktop Runtime）的 `runtime/cli/bin/dsh` 通过桌面主机入口启用 `manageDesktopProfile: true`，支持其插件管理。通用／npm 命令行（CLI）入口不具该能力，仍拒绝 `desktop`；不能仅凭命令名称相同推定支持，也不手改配置档（Profile）、自行开权限或增加兼容豁免。普通用户可使用应用插件界面，其他非受管配置档使用各自已核对入口。

预编译包不需要 `prepare` 安装钩子或先运行 Buildr。命令行（CLI）退出 0、已装包和选择项回读只证明安装，不等待热更新（HMR）或装载器（Loader）就绪；同一宿主（Host）仍运行也不能证明新模块生效。按受支持入口结果与运行事实核对激活，必要时重启后再验收按钮、三入口和重复点击，不另起宿主（Host）掩盖状态。临时隔离配置档（Profile）结果不冒充真实桌面验收。当前入口校准依据及本机安装／激活边界见[插件说明](<../../../services/dsh-plugin/plugin/README.md#构建与安装>)与[实际安装回执索引](<../../../openspec/changes/archive/2026-10-05-add-dsh-buildr-provenance/implementation-progress.md>)；发布授权与包字节仍独立核对。

验收跨重启标签复用时，分别检查标签数量与网页内容：当前 DSH 会保留浏览器标签，但页面需用户点击「恢复页面」或刷新后加载。Buildr 插件只聚焦已复认标签；不能把未自动加载说成标签复用失败，也不能为消除恢复提示而无条件刷新可能含未保存内容的页面。

Buildr 主包发版准备时先运行插件 `status`。若 `changes-pending` 或 `not-public`，先准备插件候选，分别记录插件与主包的发布授权及结果；无变化时无需重建或重发插件。卸载由 DSH 管理，不触碰 Buildr 数据。

当次采集交付使用分阶段组合（Composition）：先 `--host-stage graph-only` 保留原根服务，实体图与原轨迹／入口／设置贡献均使用内容地址；临时变更入口仅在插件管理页 `plugins.item`「来源接入验证／执行」卡片，通过无参数公有远程调用（RPC）明确执行固定五叶计划，安装不自动编辑，不注册 `sidebar.footer.action`。全部适用预设当前版本及运行行核对后，才同包正常更新启根服务，引用存在时不先移除图。根服务停换的实际热重载（HMR）残留需要正常重启另验。完整撤回先退回graph-only、保留图并恢复原根服务及必要重启，再比较恢复五叶并验证原版本可用，最后才卸载图；过渡期间不运行新工具。构建、预设接线、根激活、保存重载及三入口现场分别保全证据。公开 `apply` 成功后须立即取得 `ConfigEditor.documentPath` 元数据（Metadata）及 `configuration()` 的继承／覆盖摘要和存在标志，确认实际持久拥有者；官方移除、添加及冷启动须逐阶段独立复核，不能以暖态挂载版本替代当前持久声明。本轮无界面的只读探针（Probe）在激活后自动执行一次，不注册客户端（Client）、扩展位（Slot）或按钮；编辑仍须外部明确公开远程调用（RPC）。

真实技能文件读取、程序工具调用（PTC）子动作、资料能力目标引用、后台／转后台（Promoted）样本，以及完整实际撤回和现场并发比较／失败补偿仍待验证；父观察体系与业务价值未完成。受控检查与原生样本分开登记，第 9 节以实际证据核销。 临时变更候选仅在插件管理页 `plugins.item` 提供「来源接入验证／执行」，不注册 `sidebar.footer.action`；本轮无界面读取探针均已官方移除，历史暖态侧栏触发与撤回保留在实施索引。


## 本轮阅读与性能调整（实施中）

已确认四项调整：52px两行的可视区域虚拟列表与记录版本索引；能力无正文免原查询、方法正文有界批读；动作／对象／结果主表达与详情去重复／退出码；公共Markdown预览／原文、片段说明及单滚动。正文每批同会话最多32个真实引用，组合现有公有 `observeSession` 的一次 `projectionMode:none` 租约，最终释放并仅复制选中事件；无逐引用 `readEvent` 回退，缓存最多32项及8MiB。不新增来源反查、当前正文或用户资料观察对象。

本轮保持原八模块图、三根配置、十五个预设引用和已固定OAuth114外部身份；共享查询API不替换，只有确切变化入口及客户端使用新内容地址。构建与交付说明见[SDK边界](<../../../services/dsh-plugin/tools/source-sdk.md#本轮阅读优化的sdk与交付边界实施中>)；原Host实际方法可用与两引用对照（本机临时证据：`services/dsh-plugin/build/source-batch-performance-observed-f872aa60-253c-475f-80e6-972219bbab59.json`）不等于完整正文RPC或新界面端到端性能，已有准备缓存不称冷盘。保全旧页面基线（本机临时证据：`services/dsh-plugin/build/source-performance-companion-20261005/performance-result.json`）及原查询基线（本机临时证据：`services/dsh-plugin/build/source-read-performance-observed-d49af21f-2dc8-476b-b9a9-51fd131e1678.json`），新精确产物和性能验收仍待完成，未公开发布。

正常整应用退出／重启后的95前缀／96总数摘要（本机临时证据：`services/dsh-plugin/build/capture-whole-application-restart-verified-final.json`）与原查询回执（本机临时证据：`services/dsh-plugin/build/capture-session-observed-87f8f5b1-d661-47ea-bc08-8c832cb0007e.json`）已成立。第9节剩余真实扩展样本和完整撤回、第10节新优化各自核销，不以基本采集与重载通过完成父观察体系。
