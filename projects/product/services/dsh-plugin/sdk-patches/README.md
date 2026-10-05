# DSH 原轨迹源码增强补丁

本目录保全首步任务 `dsh-buildr-provenance` 的候选源码变化，不是已安装插件（Plugin）、已公开 DSH 版本或真实桌面验收结果。本目录当前保全原轨迹显示和稳定记录地址接线，保留原七类型、原事件、快照（Snapshot）与原详情；不新造或覆盖同名轨迹页面。

## 本轮：当次来源采集与直接读取

最新确认已取代历史阶段的查看时反查：真实生产者（Producer）当次写入 `dsh.event-sources/v1`，工具／受支持子调用使用 `data.eventSources`，规则注入使用 `message.source.eventSources`；原保存重载及查询保全，轨迹上下文发布少量元数据（Metadata），三个入口直接读取。没有字段明确未采集，不自动按当前资产、目录、名称或绑定入口补历史；正文以原事件 UTF-16 片段引用读取，用户正文不复制。规范和新待验清单见[本轮设计](<../../../openspec/changes/add-dsh-buildr-provenance/design.md>)及[第 9 节清单](<../../../openspec/changes/add-dsh-buildr-provenance/tasks.md>)。

可选 `EventSources.execution` 仅由当次实际命令解释器（Bash）前台正规化结果保存 `outcome`／`exitCode`；原生失败优先、后台／转后台未知，不在查看时解析标准输出推成功。Buildr 公有 `source inspect` 输入的 `mode` 默认 `content` 保持兼容，采集选 `metadata` 核验实际原始摘要及提供证据，响应不返回当前／观察正文，输入不发普通用户正文；查看路径完全不调用此接口。默认 `content` 的解析兼容由单元检查覆盖；摘要、片段及混合／遮蔽识别另由受控检查覆盖，未将默认正文兼容集成用例的源码存在称为本轮执行通过。

旧 `buildr.dsh-source-patch/v1` 和 `buildr.dsh-source-sdk/v1` 继续保持轨迹限定边界及原字节；旧补丁与 SDK 不修改。新增 `buildr.dsh-source-patch/v2` 明确 `hostPackages` 源码包路径数组及 `api.eventSources`：

```json
{"schemaVersion":"dsh.event-sources/v1","eventProperty":"data.eventSources","messageProperty":"message.source.eventSources","recordProperty":"TrajectoryRecordContext.eventSources"}
```

v2 可选择的生产者包是 `packages/core/tools`、`packages/core/agent-loop`、`packages/context/agent-instructions`、`packages/skill/skill`、`packages/skill/skill-filesystem`、`packages/skill/tool-skill`、`packages/fs/tool-fs`、`packages/shell/tool-bash`、`packages/shell/tool-pwsh`。只允许选定包的 `src`／`tests`／包声明及构建配置；共享类型仅明确允许 `packages/core/session/src/types.ts`、新增 `event-sources.ts`、`packages/llm/llm/src/types.ts` 和客户端（Client）透传契约 `packages/client/ui-conversation/src/client/contract/records.ts`。共享 Session／LLM 运行时（Runtime）不由此覆盖，生成目录、安装目录和未选择源码仍拒绝。增加源包须显式维护这份受支持边界，不放宽为任意 Host 源码。 v2 另仅允许本轮精确的 `docs/persistence-schema.json`、持久目录清单三份、`docs/persistence-changes/2026-10-05-event-sources` 中英确认／翻译／模式四份，及选定包的三种 README；另精确包含 tools／session／skills 子系统三种说明、配置清单三种说明、`scripts/gen-cordis-catalog.ts`／`type-equiv.manifest.json` 与正式生成的 `packages/extensions/tool-cordis/src/api-catalog.ts`。准备器不执行这些维护脚本，也不替换 tool-cordis 主机端（Host）；不开放整份文档目录、任意脚本或旧确认。原 V4 可选附加字段的兼容维护和原共享库往返仍须单独证明。

v2 可选 `clientPackages` 仅允许显式的 `packages/client/ui-settings-agent-loop` 设置贡献。其源、测试、构建声明及 README 受精确白名单限制，真实类型和客户端（Client）产物单独编译、校验并作为独立内容地址组件交付；不扩充八个生产者或共享运行时。原命名空间与新根服务命名空间的实际兼容须原桌面另验，不以构建完成核销。

v2 准备器编译选定生产者与公开声明，单次构建共享模块图并保留每包真实名称；非选定第一方基础库外置引用（Externalize）至现装 Host。`buildr.dsh-source-sdk/v2` 回执额外记录精确来源契约和 `hostArtifacts`，覆盖实体入口、共享片段、包声明及许可证／说明摘要，重新核验完整源、声明、轨迹与 Host 产物，不能用只有新类型的 SDK 代替生产者交付。准备器不启动应用或安装依赖。

服务根目录提供明确构建桥接：

```sh
node tools/prepare-source-sdk.ts --source <exact-upstream-checkout> --manifest <capture-v2-manifest> --node <selected-compatible-node>
node tools/build-development-composition.ts --source-sdk <prepared-v2-sdk> --entry <exact-dev-bundle> --source-cli <explicit-source-cli> --node <selected-compatible-node> --host-config <observed-host-config.json> --output <new-owned-output>
```

对应 npm 脚本为 `sdk:prepare`、`composition:dev`，预设适配候选为 `preset:adapter`，仍须显式传以上输入；完整检查入口 `tools/verify-all.ts` 不变。补丁源码、生成声明和 Host 产物均取同一 SDK。新生产者补丁和清单由其责任主体统一保全，当前说明不将未冻结源码或旧就绪回执称为新实际构建通过。

`--host-config` 只包含已激活的三个根拥有者，保全原始配置、原 `disabled`／`inject` 及独立观察事实；不以根层当前布尔状态替代条件表达式，也不回填解析默认值。根层停用五条保持，实体图的五模块通过公有配置编辑器（ConfigEditor）只更改实际预设（Preset）的模块引用。缺必要快照仅阻止交付，不读取整配置档或复制预设凭证。

组合正式停旧三个根行后插入独立地址，公共服务依赖恢复另验。实际预设声明锁内比较并只改五叶，原DSL、隔离、权限和其余配置保持；编辑成功另查 `broken` 与当前版本的适用生产者状态。仅预设（Preset）叶更新且原 `AgentLoop` 未卸载时，旧智能体（Agent）保留已绑定版本，不绕非空重组。本次三个根服务停换触发热重载（HMR），释放旧 `AgentLoop` 拥有的运行智能体并从列表撤下；该停换阶段先由公开元数据（Metadata）核对原会话（Session）持久存在，后续已通过受支持恢复入口核对原会话可用；恢复可合法追加结束记录，不承诺原日志字节不变，范围见实施索引。新会话另证。公开 `apply` 成功后须立即取得 `ConfigEditor.documentPath` 元数据（Metadata）及 `configuration()` 的继承／覆盖摘要和存在标志，确认实际持久拥有者；官方移除、添加及冷启动须逐阶段独立复核，不能以暖态挂载版本替代当前持久声明。失败补偿与普通撤回经同一编辑器比较，先恢复引用再卸载图。回执只记必要地址、摘要和结果，不复制整预设。

前一阶段 48 文件补丁 `e6693446077368d1f0fab17bd4bd0b9895e142ab8d4cb2e740cdf3e60fb143ed` 与 SDK `2vRnrp` 保留当时范围；后续 101 文件补丁 `95f0188dbf319d2417c23bb86c2f8b35c7d1a6ca16d2a165488d01b2a978c355` 的唯一 SDK `BzBkog` 已准备并独立核验 81 个 Host 实体摘要。设置客户端（Client）桥接增加后，工具定向 25 项通过，包含 v1 不扩权、v2 精确源码／契约边界、实体图共享、原声明保全及单一设置贡献替换。构建与受控检查不证明现装版本兼容：b59 组合曾正常安装且 254 文件一致，但原预设 `tool-skill` 失败及设置卡回归已发现，该次五叶未改变，未核销真实采集；日志与回执见本轮实施索引。首轮客户端（Client）类型失败和修复后重试分别保留；该阶段实际共享库兼容与保存重载仍待验证，下方全部 v10 及更早事实保留旧范围。

当前现场：精确 `f3b934`／`WC8mR4` 组合已通过官方入口安装，`runtime-entry-c2f1a25bb563a49d` 已冷启动激活；三个根服务（Root3）及 standard／ptc／cordis 共十五个私有模块配置和运行状态已核对，保持同一 `774a` 图。随后 95 个事件中有 11 个保存来源字段，原生窗口（Native Window）显示五条已确认 Buildr 记录：规则注入、规则读取、技能加载，以及命令行（CLI）成功／失败各一条。成功事件 `seq: 84` 同期 `exitCode: 0`，失败事件 `seq: 89` 同期 `exitCode: 1`；两者来源均为 `confirmed`，各保留一个必要目标引用，均无正文引用，原失败结果的 `isError: false` 保持。普通 README 读取 `seq: 38` 排除。 本轮软件开发工具包（SDK）`B1UEnW` 和 106 文件补丁 `4e7b3d` 保持不变；项目 Node 声明为 `24.15.0`，完整检查的 195 项 Node 检查、12 项原界面受控检查及两种实际装载器（Loader）检查通过。

这 95 个事件经同一主机端（Host）的原查询、原事件读取、持久读取及两个只读句柄重开保持一致，12 项检查通过，原历史来源、模型／请求及工具元数据（Metadata）保全。实际技能加载的原事件正文已可见，技能文件正文读取样本仍为零。原调用跳转、来源列及详情、两条能力过滤、关闭后全宽／回焦与搜索保留、清搜索不重开已在原生界面（Native UI）验证。该证明没有释放智能体（Agent）或重启 Host；整应用冷启动后的这 95 个事件前缀仍待核验，不能借此前配置冷启动通过替代。 证据见[95 事件元数据回执](<../build/capture-session-observed-0104a5f0-8c02-41c0-afcd-8e71c560dd77.json>)及[当前原生验证](<../build/capture-source-native-current-before-cold.json>)；历次配置互操作失败、版本恢复和较早受限样本保留在[实施索引](<../../../openspec/changes/add-dsh-buildr-provenance/implementation-progress.md>)。

## 历史阶段：v10 当前关联与现有显示补丁

最新用户确认要求来源列、原详情与 Buildr 标签使用同一来源标记（Source Marker），标签只过滤已确认标记的原记录；自身方法仅 `providedBy=buildr`，不把 `managedBy` 用户方法／资料或未知候选放入主列表。原事件正文与调用结果继续由 DSH 承载，当前对象关联明确历史未确认。这些业务及协议修正在独立插件（Plugin）与公开来源能力实施，当前补丁只证明已有正式接线，旧 SDK 或 v9 安装不证明新业务语义。

当次来源采集（Capture）尚缺实际生产者的技能（Skill）胜出位置、规则（Rule）绝对基准和可持久化成功结果元数据（Metadata）接口。本目录没有该采集契约，不将两个显示扩展位（Slot）、私加结果字段或内容摘要比较称为历史提供者证明；不替换 DSH 引擎或另造事件流。完整采集保留待办，新验证须另列精确输入及范围。

旧[原型范围](<../../../openspec/changes/add-dsh-buildr-provenance/prototypes/README.md>)中的 `owner`／`hasBuildr` 模拟用户资料及独立历史正文仓，不作为本轮实现依据；最新确认优先，只保留七类型、附加来源维度和原详情交互的历史参考。

## 历史显示阶段的精确输入

- 上游来源为 `deepseek-ai/deepseek-harness` 的 `dsh-v0.2.0-rc.2`，精确提交为 `639ed015397290b3745d163aafe02ffee4aa3f84`。
- [完整补丁](<dsh-v0.2.0-rc.2-trajectory-annotations.patch>)为原始 `git diff --binary --full-index`，包含全部新增源码和测试。
- [来源清单](<dsh-v0.2.0-rc.2-trajectory-annotations.json>)记录基线、补丁摘要值（Digest）、每文件原始／候选摘要值（Digest）、接口位置与实际验证范围；路径相对上游源码或本目录，不保存本机绝对路径。
- 当前用户安装的桌面构建提交为 `5e9e301dd9dc8923b2762f76dacfc5751f6ca851`，不是上述源码基线。同为 `0.2.0-rc.2` 不代表同一构建；补丁不证明普通 rc.2 或整个次版本（Minor Version）均支持新接口。

## 接入能力

原轨迹正式声明两个列表／会话扩展位（List/Session Slot）：`conversation.trajectory.column` 与 `conversation.trajectory.inspector.objects`。前者由原表格管理列、表头、单元格、顺序和虚拟跨列数，再通过 `renderSlot(..., { only: id })` 分发插件（Plugin）单元格；后者追加在原概述之后，保留原参数、结果、定义、计时等标签。贡献撤回恢复原布局，保留原记录选择。

两个位置的参数由软件开发工具包（SDK）派生 `PropsRuntime`，并共享只含 JSON 的 `TrajectoryRecordContext`：带品牌的 `TrajectoryRecordId`、原七类型、原始整数事件地址及可用调用关系。`SessionId` 保留官方品牌；调用标识沿用现有客户端（Client）读模型字符串，不改变主机端（Host）握手。没有持久事件的记录保留空引用和 `transient: true`；显示索引、流式占位和中断小数排序锚不当作事件地址。公开记录身份以 `JSON.stringify(['trajectory-record', internalRecordId])` 编码，使内部 NUL 分隔符变成转义字面而不进入受校验字符串；原内部选择和折叠身份不变。记录身份参数不复制正文和结果元数据（Metadata）；实际阅读仍引用 DSH 原事件及原详情，来源标记不建立另一份历史正文仓。

`useTrajectory` 同时发布 `recordContexts`：当前已加载会话（Session）窗口内的逻辑记录，不是默认 50 节点裁剪、搜索或折叠子集，也不是全部未加载历史。它在原目标快照（Snapshot）引用变化时，同包使用原布局与地址推导一次并缓存；订阅仍属于原目标。此候选优先保证功能准确，流式情况下额外布局推导的性能影响仍需后续针对性检查，不在每个单元格扫描原始事件。

## 应用与回退

只从上述精确提交的干净源码应用补丁，先核对每文件原始摘要值（Digest），执行 `git apply --check` 后应用，再核对所有候选摘要值（Digest）。原版本号或提交标记不足以证明补丁已生效。软件开发工具包（SDK）类型、正式构建产物与目标运行时（Runtime）必须分别校验；不能复制研究缓存、手改安装归档、使用版本豁免或启动替代服务器冒充桌面生效。

旧私有 v9 的完整构建、官方安装与限定原桌面结果见[实施索引](<../../../openspec/changes/add-dsh-buildr-provenance/implementation-progress.md>)；本轮精确组合的安装与限定验收已在当前现场段登记，本目录不执行发布、安装或升级动作。正常禁用贡献可以撤回列及对象区域；不会关闭现有 Buildr 页面、停止服务、删除业务数据或改写原日志。

## 实际验证与未覆盖

- 候选轨迹包局部测试（Focused Test）实际通过：13 个文件通过、199 个用例通过，3 个既有构建包测试因尚未构建而跳过。新增用例覆盖稳定记录身份、真实事件地址、嵌套调用、中断、列排序与语言变化、跨列、详情撤回、真实注册框架生命周期以及已加载窗口 JSON 列表；原表格、布局、详情、时间线和代码检查用例仍通过。
- 公开身份修复还执行真实跨层校验：SDK 生成原七类记录后，经 `parseSourceRecordRequest`、`sourceObservationsForRecord` 与 `parseSourceObservations` 全部接受，原始引用与稳定身份保持；旧版补丁字节保留在 `history/` 并标明撤回，不作为当前可用输入。
- 锁定依赖以 `--ignore-scripts` 安装，未运行安装脚本；品牌仅新增一个本地类型依赖（Type-only Dependency），根锁文件只增加对应 3 行工作空间（Workspace）链接，没有外部版本漂移。
- 真实项目类型检查（Type Check）仍失败于尚未生成的主机端（Host）远程声明，本轨迹包没有剩余类型诊断；不能将其说成完整软件开发工具包（SDK）类型检查通过。
- 第一次使用捆绑 Node 运行测试因本机动态库签名不兼容而未进入用例；改用已有兼容 Node 后执行上述测试，没有修改签名或重新安装绕过。
- 上述是补丁形成时的局部检查，未运行该阶段全仓库图形界面（GUI）测试、完整构建或真实桌面。后续旧 v9 组合已有独立构建、浏览器和限定桌面证据，不能继续称全部未安装，也不能以该证据证明本轮新标记协议、过滤或 capture。这里没有 Buildr 业务来源解析，其职责属于薄插件（Plugin）与 Buildr 公开只读能力；历史缺证据保持未知。

当次采集交付使用分阶段组合（Composition）：先 `--host-stage graph-only` 保留原根服务，实体图与原轨迹／入口／设置贡献均使用内容地址；临时变更入口仅在插件管理页 `plugins.item`「来源接入验证／执行」卡片，通过无参数公有远程调用（RPC）明确执行固定五叶计划，安装不自动编辑，不注册 `sidebar.footer.action`。全部适用预设当前版本及运行行核对后，才同包正常更新启根服务，引用存在时不先移除图。根服务停换的实际热重载（HMR）残留需要正常重启另验。完整撤回先退回graph-only、保留图并恢复原根服务及必要重启，再比较恢复五叶并验证原版本可用，最后才卸载图；过渡期间不运行新工具。构建、预设接线、根激活、保存重载及三入口现场分别保全证据。

真实技能文件读取、程序工具调用（PTC）子动作、资料能力目标引用、后台／转后台（Promoted）样本，以及完整实际撤回和现场并发比较／失败补偿仍待验证；父观察体系与业务价值未完成。受控检查与原生样本分开登记，第 9 节以实际证据核销。 精确双客户端（Client）的[WC8 浏览器证明](<../build/source-ui-browser-WC8mR4-input-proof-0e4dda9d.json>)及[七类伴随证明](<../build/source-seven-kinds-companion-20261005-ed633e8b/browser/seven-kind-result.json>)覆盖受控界面范围；[原接口双页证明](<../build/source-pagination-companion-20261005-53f4c8d1/pagination-result.json>)还验证原控制器游标、较早页拼接、稳定整数引用及原来源／结果／元数据。这是内存存储上的真实原接口与组装检查，不代表原生分页按钮、JSONL 后端分页或跨平台样本。
