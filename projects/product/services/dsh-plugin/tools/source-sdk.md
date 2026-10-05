# 当次来源采集的软件开发工具包（SDK）输入

本轮增强源码只在显式准备并核验的源码软件开发工具包（SDK）上编译。上游 `dsh-v0.2.0-rc.2`／`639ed015397290b3745d163aafe02ffee4aa3f84` 是源码基准，现装桌面构建 `5e9e301dd9dc8923b2762f76dacfc5751f6ca851` 不同。版本号、候选类型和旧 SDK 不证明现装生产者、保存重载及界面支持新契约。

## 本轮输入与边界

持久输入为[事件来源 v2 清单](<../sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.json>)与[完整补丁](<../sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.patch>)，核对精确上游身份、全部原始／候选摘要和接口。准备器（Preparer）从精确独立 Git 检出的提交归档创建唯一输出，再应用补丁；不复制修改中的工作目录，不改变输入检出、旧 SDK、配置档（Profile）、应用归档或已装共享库。

`buildr.dsh-source-patch/v2` 明确选定 `hostPackages` 和 `api.eventSources`。本轮选八个生产者（Producer）：`core/tools`、`core/agent-loop`、`context/agent-instructions`、`skill/skill`、`skill/skill-filesystem`、`skill/tool-skill`、`fs/tool-fs`、`shell/tool-bash`，路径均在 `packages/`。可改范围仅这些选定包源码、测试与声明／构建配置，以及精确允许的 Session／LLM 类型和 `ui-conversation` 记录透传类型；不覆盖共享 Session／LLM 运行时（Runtime），不允许任意 Host 源码或生成／安装目录。具体边界以准备器和[补丁说明](<../sdk-patches/README.md>)为准。 v2 另仅允许本轮精确的 `docs/persistence-schema.json`、持久目录清单三份、`docs/persistence-changes/2026-10-05-event-sources` 中英确认／翻译／模式四份，及选定包的三种 README；另精确包含 tools／session／skills 子系统三种说明、配置清单三种说明、`scripts/gen-cordis-catalog.ts`／`type-equiv.manifest.json` 与正式生成的 `packages/extensions/tool-cordis/src/api-catalog.ts`。准备器不执行这些维护脚本，也不替换 tool-cordis 主机端（Host）；不开放整份文档目录、任意脚本或旧确认。原 V4 可选附加字段的兼容维护和原共享库往返仍须单独证明。

v2 另可显式选择 `clientPackages: ["packages/client/ui-settings-agent-loop"]`，仅维护该设置贡献的源码／测试／构建声明与三种 README，编译其真实类型和浏览器产物并逐项摘要核验。此选择不增加主机端（Host）包；新组合只撤回原设置贡献并启用内容地址独立的客户端（Client）贡献。旧 v1 和未选择此字段的 v2 不扩权；构建通过不能证明现装配置命名空间兼容。

来源契约为 `dsh.event-sources/v1`，工具及受支持子调用使用 `data.eventSources`，规则注入使用 `message.source.eventSources`；上下文（Context）透传少量元数据（Metadata）。无字段明确未采集，不按旧记录反查当前资产。正文片段引用原事件，不新增正文仓或原七类之外的类型。Buildr `source inspect` 默认 `mode: content` 保持兼容，采集用 `metadata` 核验真实摘要与资产依据；查看端完全不调用。默认 `content` 的解析兼容由单元检查覆盖；摘要、片段及混合／遮蔽识别另由受控检查覆盖，未将默认正文兼容集成用例的源码存在称为本轮执行通过。可选命令解释器（Bash）`execution` 是实际前台同期结果，后台未知、原生失败优先，不靠查看时解析输出猜成功。

## 准备与构建

构建依赖须已使用冻结锁文件和 `--ignore-scripts` 安装。准备器只读复用第三方依赖，将工作空间（Workspace）链接定向到独占输出，不调用 pnpm 或安装脚本；输入依赖不齐时失败，不自动下载。使用已选择兼容的明确 Node 绝对路径，示例变量不修改全局绑定。

```sh
DSH_BUILD_NODE=<explicit-compatible-node>
"${DSH_BUILD_NODE:?}" tools/prepare-source-sdk.ts \
  --source <exact-upstream-checkout> \
  --manifest sdk-patches/dsh-v0.2.0-rc.2-event-sources-settings.json \
  --node "${DSH_BUILD_NODE:?}"
```

输出 JSON 的 `sdk` 是该次唯一目录。只有全部准备成功、就绪回执（Receipt）通过重新核验后，才能作为明确构建输入；失败输出保留诊断而不产生可用回执。准备与验证均不启动应用或替代服务器。

```sh
"${DSH_BUILD_NODE:?}" tools/build-plugin.ts --source-sdk <prepared-v2-sdk> --output <owned-candidate-root>
"${DSH_BUILD_NODE:?}" tools/build-plugin.ts --dev --source-sdk <prepared-v2-sdk> --output <owned-dev-candidate-root>
"${DSH_BUILD_NODE:?}" tools/verify-all.ts --source-sdk <prepared-v2-sdk>
"${DSH_BUILD_NODE:?}" tools/build-development-composition.ts \
  --source-sdk <prepared-v2-sdk> --entry <exact-dev-bundle> \
  --source-cli <explicit-source-cli> --node "${DSH_BUILD_NODE:?}" \
  --host-config <observed-host-config.json> --output <new-owned-output>
```

`sdk:prepare`／`composition:dev` 是同工具的 npm 桥接，仍须显式传入以上输入。`build-plugin.ts`／`verify-all.ts` 原入口不改变；完整检查在唯一目录生成两种插件（Plugin），将精确路径交给共存测试及实际装载器（Loader），不读取固定旧产物。`BUILDR_DSH_SOURCE_SDK_ROOT` 仍可显式选择 SDK，不自动认为普通 rc.2 已增强。

## 实体产物与就绪核验

先编译实际 Host 提供者及选定生产者 TypeScript 项目，使用原 `WorkspaceTypertGenerator` 生成真实远程声明，再编译客户端（Client）依赖项目并构建原轨迹浏览器产物。编译探针（Compiler Probe）检查正式列／详情扩展位（Slot）、`TrajectoryRecordContext`、已加载窗口 `recordContexts`、真实 `eventRefs` 及带类型的事件来源字段；不以占位声明或 `any[]` 通过。

选定 Host 包在一次共享模块图中编译，Tools／Skill 状态不因每包独立构建重复；每包保留真实公开名称、入口、声明和许可证。非选定第一方模块外置（Externalize）至原 Host，实体目录与共同片段由 `hostArtifacts` 完整记录，所有摘要逐项校验。共享运行时（Runtime）的实际兼容仍须在现装版本另验证，不能因类型编译成功推断。

`buildr.dsh-source-sdk/v2` 回执包含完整源、生成声明、轨迹产物、选定 Host 实体闭包、公开契约及 API 探针；原子发布 `ready`。使用时再核对清单、补丁、精确提交重建的完整源、所有输出清单及字节摘要。[实际字节漂移负例](<../build/capture-sdk-byte-drift-proof-20261005/result.json>)在独立物理副本分别改动源和生成产物各一字节，公开校验均拒绝；副本初始及恢复后校验通过，原 SDK／候选输入摘要保持。此证据仅保护构建输入，不证明运行时激活。已有文件、部分编译或版本标记均不代替就绪。

## 组合与实际配置

`--host-config` 是三项已激活根拥有者的数组：`id`、原始 `config`、原 `disabled`／`inject`（确实存在时）及 `observed`。观察事实明确原限定条目标识、包名、根 Include 拥有者、实际启用／运行状态和解析配置；解析值只作回执比对。缺值、错误拥有者、凭证及旧布尔平化格式拒绝交付，不以 `agents:[]` 等默认值回填。

正式阶段先以 `--host-stage graph-only` 安装同一图和客户端（Client）贡献，不补默认配置、不撤回或插入根服务；经公开远程调用（RPC）完成适用预设五叶编辑及当前版本检查后，才以同包 `--host-stage root-replacement` 正常更新激活三根服务。引用图存在时不先移除包。原轨迹、入口及设置贡献均用独立内容地址，变更代码不复用旧模块 URL。

私有组合（Composition）只停换 Tools／AgentLoop／Skill 三根服务；同图其余五模块作为预设（Preset）产物引用，不强开根层停用行。实际预设拥有者通过公有配置编辑器（ConfigEditor）锁内比较，只改五个唯一模块地址，保留条件、配置、隔离、权限和身份；整份预设不进入候选。当前版本无 `broken`、适用运行行、失败补偿和撤回分别验证；用户修改不覆盖，图卸载前恢复引用。仅预设（Preset）叶更新且原 `AgentLoop` 未卸载时，旧智能体（Agent）保留已绑定版本。本次三个根服务停换触发热重载（HMR），释放旧 `AgentLoop` 拥有的运行智能体并从列表撤下；该停换阶段先由公开元数据（Metadata）核对原会话（Session）持久存在，后续已通过受支持恢复入口核对原会话可用；恢复可合法追加结束记录，不承诺原日志字节不变，范围见实施索引。新会话另验。

### 实际预设适配候选

[正式适配器](<build-preset-adapter.ts>)的 `preset:adapter` 桥接只生成独立、任务内候选，不安装、不新建会话、不读取整配置档。编辑候选安装仅在插件管理页 `plugins.item` 卡片提供「来源接入验证／执行」和无参数公开远程调用（RPC），不注册 `sidebar.footer.action`，不自动编辑；明确外部调用后一次执行，重复调用复用结果。本轮 `inventory` 只读探针（Probe）在激活后自动执行一次，不注册客户端（Client）、扩展位（Slot）或按钮；`apply`／`rollback` 仍须外部明确公开远程调用（RPC）。`transaction-probe` 只执行公有空事务，验证触发不继承热重载（HMR）事务；`snapshot` 读取选定模块地址／路径与摘要、当前版本及已挂载行状态；`apply` 仅依据已观察原始摘要和五个实体模块摘要，通过公有配置编辑器（ConfigEditor）修改五个 `name`；`rollback` 依据成功回执比较并恢复五叶，保留最新其它字段。计划与撤回回执先经过闭合元数据（Metadata）字段校验并构造规范对象，拒绝正文／凭证／额外字段，不直接嵌入未知 JSON。回执（Receipt）在动作前独占预留唯一有界任务产物，失败不覆盖旧结果。

```sh
"${DSH_BUILD_NODE:?}" tools/build-preset-adapter.ts --source-sdk <prepared-v2-sdk> --action transaction-probe --output <new-owned-output>
"${DSH_BUILD_NODE:?}" tools/build-preset-adapter.ts --source-sdk <prepared-v2-sdk> --action snapshot --output <new-owned-output>
"${DSH_BUILD_NODE:?}" tools/build-preset-adapter.ts --source-sdk <prepared-v2-sdk> --action apply --plan <observed-five-leaf-plan.json> --output <new-owned-output>
"${DSH_BUILD_NODE:?}" tools/build-preset-adapter.ts --source-sdk <prepared-v2-sdk> --action rollback --receipt <successful-apply-receipt.json> --output <new-owned-output>
```

只有明确预设身份、原声明／五行摘要、最终已装图归属及完整图字节核验成立，才能由唯一执行者通过官方管理器运行候选。适配器只验证五个入口字节，完整图闭包另由组合安装回执证明。编辑成功之后，公开 `apply` 成功后须立即取得 `ConfigEditor.documentPath` 元数据（Metadata）及 `configuration()` 的继承／覆盖摘要和存在标志，确认实际持久拥有者；官方移除、添加及冷启动须逐阶段独立复核，不能以暖态挂载版本替代当前持久声明。还须确认当前版本无 `broken`、适用行运行并核对新真实事件；失败按当前完整摘要比较后补偿，拒绝或补偿失败不能卸载被引用图。完整撤回先把同一包恢复为 `--host-stage graph-only`，保留图并恢复原根服务／必要重启；再经公开远程调用（RPC）比较恢复五叶、验证原版本可用后才移除图，遇用户修改不覆盖。过渡阶段不运行新工具。旧候选的就绪回执与类型检查不证明现场接口／执行兼容。

仅正式插件包不能让原 Host 自动采集；完整行为需要准确的根服务组合、实际预设拥有者编辑或受支持的 Host 升级。构建不证明现场已激活、有效配置保全、共享库兼容或新事件保存重载。本工具不安装、改配置档或豁免版本／类型；实际写入由唯一执行者通过官方编辑器与管理器完成，公开发布独立授权。

阅读优化前的采集现场：精确 `f3b934`／`WC8mR4` 组合已通过官方入口安装，`runtime-entry-c2f1a25bb563a49d` 已冷启动激活；三个根服务（Root3）及 standard／ptc／cordis 共十五个私有模块配置和运行状态已核对，保持同一 `774a` 图。随后 95 个事件中有 11 个保存来源字段，原生窗口（Native Window）显示五条已确认 Buildr 记录：规则注入、规则读取、技能加载，以及命令行（CLI）成功／失败各一条。成功事件 `seq: 84` 同期 `exitCode: 0`，失败事件 `seq: 89` 同期 `exitCode: 1`；两者来源均为 `confirmed`，各保留一个必要目标引用，均无正文引用，原失败结果的 `isError: false` 保持。普通 README 读取 `seq: 38` 排除。 最新输入为 `B1UEnW` 和 106 文件补丁 `4e7b3d`；项目 Node 声明为 `24.15.0`，完整双入口检查的 195 项 Node、12 项原界面受控检查及两种实际装载器（Loader）已通过。

这 95 个事件经同一主机端（Host）的原查询、原事件读取、持久读取及两个只读句柄重开保持一致，12 项检查通过，原历史来源、模型／请求及工具元数据（Metadata）保全。实际技能加载的原事件正文已可见，技能文件正文读取样本仍为零。原调用跳转、来源列及详情、两条能力过滤、关闭后全宽／回焦与搜索保留、清搜索不重开已在原生界面（Native UI）验证。该同Host回执本身没有释放智能体（Agent）或重启Host；随后正常整应用退出／重启已另证95原前缀来源／工具／请求保持，恢复总数96，原查询／存储及重开通过。此新证据与此前配置冷启动分开，不声称总数不变，也不核销扩展矩阵。 证据见[95 事件元数据回执](<../build/capture-session-observed-0104a5f0-8c02-41c0-afcd-8e71c560dd77.json>)、[当前原生验证](<../build/capture-source-native-current-before-cold.json>)及[精确 WC8 浏览器证明](<../build/source-ui-browser-WC8mR4-input-proof-0e4dda9d.json>)。另有[原接口双页证明](<../build/source-pagination-companion-20261005-53f4c8d1/pagination-result.json>)，覆盖内存存储上的原控制器游标、较早页拼接及稳定引用，不冒称原生分页按钮或 JSONL 后端分页通过；历次过程保留在[实施索引](<../../../openspec/changes/add-dsh-buildr-provenance/implementation-progress.md>)。

真实技能文件读取、程序工具调用（PTC）子动作、资料能力目标引用、后台／转后台（Promoted）样本，以及完整实际撤回和现场并发比较／失败补偿仍待验证；父观察体系与业务价值未完成。受控检查与原生样本分开登记，第 9 节以实际证据核销。

## 保留的旧输入

旧 `buildr.dsh-source-patch/v1` 与 `buildr.dsh-source-sdk/v1` 继续只允许原轨迹边界，旧补丁与 `8ioH9Q` SDK 字节保留。`0.2.0-rc.1` 和 `0.1.7-rc.2` 仍在[基线清单](<sdk-baselines.ts>)；这些输入不满足本轮采集前置。旧 v10b 当前关联构建、安装和局部桌面证据保留历史范围，不能核销本轮采集。发布准备 `release.ts prepare --source-sdk` 仍受原源码已提交、版本未公开及候选不可覆盖约束；接线维护不代表新公开包已准备或发布。


## 本轮阅读优化的SDK与交付边界（实施中）

本轮沿用B1的八个主机端（Host）生产者及原设置客户端（Client），组合已有公有 `sessionQuery.observeSession(...,{projectionMode:'none'})` 为正文批读：同会话每请求最多32个去重真实引用，一次观察租约（Observation Lease）并最终释放，只复制选中事件；不新增或替换共享SessionQuery模块，不在应用归档中修改接口。能力无正文直接读已加载字段，正文缓存限制32项／8MiB；新列表虚拟化（Virtualization）、动作对象结果及公共Markdown预览／原文属于Buildr入口客户端的本轮变化，须由新的精确双产物验证。

当前实际Host已提供该公有方法，两引用同场测量见[公共批内观察对照](<../build/source-batch-performance-observed-f872aa60-253c-475f-80e6-972219bbab59.json>)；六次租约均释放。它只选择序号／类型，不测完整正文复制与远程调用（RPC）传输，大日志已有准备缓存，不是冷盘性能。探针final1没有实际取消；后来受控微任务边界揭示交付前取消可丢租约，final2修复并以[取消边界检查](<../build/source-batch-performance-candidate-20261005-final-2/cancellation-edge-checks.json>)证明取得1／释放1，不重复同Host测量或升级实际取消范围。

最终新私有组合须保全 `774a` 八模块图、三个已观察根配置、十五个预设模块地址及OAuth0.0.114外部身份，不为阅读优化重建或热卸载根服务。变化入口／客户端使用新的内容地址，核对实际Loader入口；安装与本地文件一致不单独证明运行更新。Node使用项目声明的24.15.0，具体产物尚待本轮冻结，未发布。

正常整应用重启证据：[摘要](<../build/capture-whole-application-restart-verified-final.json>)、[96事件原查询](<../build/capture-session-observed-87f8f5b1-d661-47ea-bc08-8c832cb0007e.json>)。历史基线与新性能验收见[第10节](<../../../openspec/changes/add-dsh-buildr-provenance/tasks.md>)，9.9／9.11未取得的撤回及扩展样本保留。
