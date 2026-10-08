# Buildr DSH 桌面插件

本插件（Plugin）在 DSH（DeepSeek Harness）桌面版侧栏底部提供 Buildr 按钮。点击后，主机端（Host）发现本机 Buildr、查询健康状态，客户端（Client）在右侧浏览器打开页面。正式版包 `@buildr-ai/buildr-dsh-plugin` 只服务 npm 安装的 Buildr；开发版包 `@buildr-ai/buildr-dsh-plugin-dev` 只服务本机源码。当前安装方案要求一个 DSH 配置档（Profile）同时只安装一个 Buildr 插件（Plugin），切换前由用户卸载已有版本。

## 兼容边界

- 既有侧栏打开入口的编译输入保留旧基线；来源增强属于明确源码补丁（Source Patch）候选，必须使用经核验的源码软件开发工具包（SDK），不能把旧基线或原版 rc.2 当成增强接口。DSH 升级后须重新验证。
- 使用 DSH 公开的 `sidebar.footer.action` 席位（Seat）和桌面浏览器接口。网页版不支持此入口，Buildr 的禁止内嵌框架（iframe）响应头保持不变。
- 当前会话（Session）不存在或选中全局面板时，不创建会话、不切换主页面。点击期间切换现场会取消打开。
- 每次点击重新查询 Buildr 健康地址。相同地址优先聚焦本入口创建、仍存在于当前会话的标签页（Tab）；客户端重载和 DSH 重启后也按记录复认。正式版和开发版分别记录。地址变化时保留旧页并另开新页。
- 开发程序须由 Buildr 公开查询证明与当前登记源码匹配，不能只凭开发渠道认定当前版本。旧程序仍健康但来源不同，或旧记录缺少来源证明时，入口提示通过 Buildr 正常退出后重启，不自行终止程序。来源比较沿用目录、提交与产品身份，不新增未提交文件内容指纹。
- 自动发现的查询入口明确缺失或变化时，同一次点击共享一次重新发现与重试。显式配置的 `binding` 保持原绑定；查询失败、启动器缺失或来源不匹配不触发改绑。禁用期间尚未完成的发现不能继续查询或启动。
- DSH 重启后，右侧浏览器只保留标签标题和地址，页面等待用户点击「恢复页面」或刷新按钮才会加载。Buildr 按钮会复用并聚焦该标签，但当前 DSH 公开接口不提供按标签判断待恢复状态及执行恢复的动作；插件不会无条件刷新已加载页面，以免丢失未保存内容。
- DSH 公开标签列表不提供浏览器当前地址，因此不能可靠认领用户手动打开的 Buildr 标签，也不能识别插件标签后来被导航到其他网站。本机存储不可用时，跨重启复用不可用。
- 禁用或卸载只撤销插件贡献，不关闭现有页面、不停止 Buildr、不删除其数据。

### 一个配置档只安装一个 Buildr 插件

安装检查识别 `@buildr-ai/buildr-dsh-plugin`、`@buildr-ai/buildr-dsh-plugin-dev`、`@buildr-ai/buildr-dsh-development-composition` 与旧 `@buildr-ai/dsh-plugin-dev` 的直接依赖、真实包清单及 npm 别名；停用仍算已安装。DSH 原插件安装页检查已有版本，并提示“同一时间只能安装一个 Buildr 插件，请先卸载当前版本，再继续安装”；实际安装与更新在配置档（Profile）写锁内复查，拒绝时不运行包管理器（Package Manager）、不保存构建脚本授权，不自动停用、卸载或替换已有包。已识别的无关包保持原行为；已有 Buildr 而待安装来源无法核实身份时，报告身份检查失败。

这个安装前检查属于 DSH 原安装器（Installer），独立插件（Plugin）没有安装前拦截接口，不能通过安装 Buildr 包把它注入当前安装器。增量源码补丁（Source Patch）及完整 DSH 候选与当次来源软件开发工具包（SDK）分开保全，见[安装检查交付边界](<../sdk-patches/README.md#buildr-插件安装检查>)。日常 DSH 已采用完整源码构建的本机开发应用和独立开发插件；后续源码修正仍需独立构建与采用，不因修改补丁或构建插件便宣称已生效。旧正式发行包与本机开发组合同时存在的历史结果不证明新方案允许共存。两包的命名空间隔离检查只证明装载器（Loader）不会因同名服务冲突，不证明原安装页检查已生效。

本机增强开发组合还替换了三个根服务及十五个预设（Preset）引用。普通卸载目前不会自动恢复这些引用；切换该组合前必须完成已记录的完整撤回，不能把本轮安装互斥检查当成撤回实现。简单独立插件（Plugin）的正常卸载仍由 DSH 管理，本轮不增加自动卸载能力。

## Buildr 自身参与观察

第一步为 Buildr 自身规则（Rule）、技能（Skill）、命令行（CLI）及工具（Tool）建立可信观察数据源。原七类型、正文、调用结果、顺序和交互继续由 DSH 承载；来源标记（Source Marker）是附加维度。原来源列、原详情附加区和并列 Buildr 标签通过正式扩展位（Slot）读取同一当次来源；不另建执行流水。

2026-10-05 最新确认改为“当次采集、随原事件保存、查看直接读取”。生产者（Producer）在实际规则注入、技能胜出读取及能力调用现场写入 `dsh.event-sources/v1`；工具及受支持子调用写 `data.eventSources`，规则注入写 `message.source.eventSources`。原会话（Session）保存、重载和查询保全这些小元数据（Metadata），轨迹上下文将其传给三处显示。查看时不查询当前 Buildr 安装、目录或资产，不使用旧记录反查，也不按名称猜所属。没有字段明确为“未采集”，不解释为没有 Buildr 参与。

Buildr 标签只过滤当前已加载窗口中当次字段为 `confirmed`、且实际匹配 `providedBy=buildr` 的原记录，与来源列使用同一标记。`unknown`、`not-applicable`、未采集和无效字段不进入主列表，原轨迹仍保留。`providedBy` 表示提供关系；仅由 Buildr 管理的用户方法或资料不能据 `managedBy=buildr` 获得自身标记。普通用户资料、代码和数据的直接读取不属于自身参与；经 Buildr 能力访问保留调用和必要对象引用，新增元数据（Metadata）、缓存及附加界面不复制用户正文。

### 当次身份、动作与原生正文

匹配项保全身份、名称、定位器（Locator）、当次版本摘要、依据及可用动作；`completeness` 区分当次完整、片段或无正文。`contentRefs` 的 `{block,start,end,unit:'utf16'}` 指向原事件内容块内半开区间 `[start,end)`，不另存方法正文。核心规则（Rule）只引用实际受管区块（Managed Block），区块外用户文字不整体归属 Buildr；技能（Skill）使用实际胜出位置及读取事实，不以目录候选替代。

来源确认与执行结果分开。失败的已确认 Buildr 调用仍有标记；原生错误优先保留。可选 `EventSources.execution` 只由实际命令解释器（Bash）前台正规化结果同期写入 `outcome`／`exitCode`，后台及转后台保持未知。查看端不解析标准输出猜成功，不从父调用标记推断子工具（Subtool）来源，也不推断智能体（Agent）采纳、遵循、贡献或任务完成。

三处标记同步解码已经加载的小元数据（Metadata），不发额外来源远程调用（RPC）。本轮已确认的阅读优化使用现有公有 `sessionQuery.observeSession`：仅明确选择有正文引用的记录或刷新时，同会话每批最多32个去重真实 `eventRefs[].seq`，`projectionMode: none` 一次观察租约（Observation Lease）取得同一切点，校验身份／调用后只复制选中事件并最终释放；不回退逐引用 `readEvent`。能力 `completeness: none` 且没有合法正文引用时，直接显示已加载动作、对象和执行事实，不为新增正文区查询原事件。正文失败不撤销已有来源事实；未知／未采集记录不触发当前资产补证。原参数、结果、定义和计时继续通过 DSH 原详情及“查看原始调用与结果”查看。该实现与新客户端交付仍在本轮清单内，实际API可用和两引用测量不冒充完整正文界面已验收。

### 读取、关闭与缓存范围

三个入口共享每个会话（Session）的读取器（SourceReader），原事件正文请求保持单条通道，本轮在请求内部批读真实引用，原参数／结果不复制成新的正文仓。当前已加载窗口先于原页默认裁剪、搜索和折叠，不代表全部未加载历史；身份、真实引用或已采集元数据（Metadata）改变时使相应缓存失效。本轮正文缓存（Content Cache）最多32项及8MiB，按最近使用淘汰；窗口外回收、最后消费者离开清理并拒绝迟到结果，保全取消和迟到租约释放，不宣称同步主机计算立即中断。

默认全宽列表，明确选择后打开可关闭详情。关闭保留搜索、原记录顺序、可视锚点及有效结果；搜索、清搜索与迟到返回不自动重开。原行不可见时回焦可见行或搜索框，不附带选择或查询。紧凑两行、窄容器堆叠和输入区上方的有界正文继续作为回归范围；本轮新编译客户端（Client）及真实桌面必须分别取得新证据。

### 本轮列表与方法阅读优化（实施中）

52px固定两行列表按可视区域及有限缓冲虚拟化（Virtualization），标记／检索索引随已加载记录和来源版本更新；主表达是动作、对象、结果，详情去除同义重复并保留来源、实际时间和同期退出码。方法片段使用公共Markdown预览／原文切换，二者来自同一当次UTF-16引用；说明完整／片段／无正文，详情只用一个纵向正文滚动容器。原序、关闭全宽／可视锚点／搜索／回焦及输入区上方末行继续回归。

旧[受控页面基线](<../build/source-performance-companion-20261005/performance-result.json>)在5000全部来源时挂载5000行、初开中位约597ms；旧[实际原查询](<../build/source-read-performance-observed-d49af21f-2dc8-476b-b9a9-51fd131e1678.json>)对17MB非活动日志两引用约315ms首次／143ms重复。新的[实际公共租约对照](<../build/source-batch-performance-observed-f872aa60-253c-475f-80e6-972219bbab59.json>)确认原Host公有方法可用，96事件原pair1.869ms、批内两引用0.085／0.030／0.026ms；17MB原pair292.267ms，批内6.557／0.704／3.246ms，六次租约均释放。大日志已有其他拥有者准备缓存，这不是冷盘或完整正文RPC／页面端到端性能，探针无界面且已移除。功能检查通过、测量成功和优化验收分开，最新状态见[第10节清单](<../../../openspec/changes/archive/2026-10-05-add-dsh-buildr-provenance/tasks.md>)。

### 采集时使用 Buildr 公开只读能力

Buildr 公有 `agent-assets source inspect` 输入新增 `mode: metadata|content`，默认 `content` 保持既有调用兼容。采集提供者（Capture Provider）选择 `metadata`，用实际原始摘要与资产提供证据核验自身方法；输入不发送普通用户正文，响应不返回 `current`／`observed` 正文。服务端仍可能读取自身资产字节完成核对，不能称无资产读取。来源正文始终引用 DSH 原事件，查看路径完全不调用此接口。

开发版可在明确本机候选中设置 `sourceBinding`，使用明确 Node／源码命令行（CLI）及摘要选择来源元数据（Provenance Metadata）查询提供者。实际命令身份独立核对明确候选及正常公开安装状态批准的本渠道入口，候选查询指针不代替已登记开发包装器；`open()` 继续原 `binding`，不因采集而启动另一份网页服务。正式版仍使用正常安装发现，不随包携带本机路径。采集失败写未知及局部诊断，不回退到未经证明的其它安装，不阻止原动作完成。

主命令行（CLI）支持准确包装器、已批准Node与入口组合，以及真实文件身份相同且观察版本复核通过的明确路径别名。同摘要复制品或其它安装不按名称确认；裸`buildr`／`node`缺当次命令解释器（Shell）执行世界证明时保持未知，不采用主机端（Host）PATH查找。当前已投射、确由Buildr提供的本地技能附属脚本，在已批准解释器的真实脚本参数位置核对成员、回执与实际摘要，记录能力调用、入口版本及原执行结果，不扫描其它参数，不新增正文。

资料集合检查记录任务标识（Task ID）；`task materials write`唯一合法`--path`明确单个文档时同时记录该确切相对路径。非法或歧义路径只缺附加引用，输入清单／正文文件不作为业务资料对象，资料正文仍由原DSH结果承载。

### 当前证据与历史阶段

阅读优化前，当次采集与直接读取的限定主路径已验证：官方安装并激活 `f3b934`／`runtime-entry-c2f1a25bb563a49d`，原窗口显示规则注入／读取、技能加载及能力成功／失败五条 Buildr 记录。95 个事件的原查询、原事件读取、原存储及同主机端（Host）两个只读句柄重开一致；普通 README 直接读取排除，失败命令行（CLI）来源仍确认，实际退出1与原 `isError:false` 保持，能力只留必要目标引用而无来源正文。原技能正文、失败调用原跳转、来源列／附加详情及关闭回焦已现场核对。整应用冷重启后的95原前缀随后已证、恢复总数96；真实技能文件读取、程序工具调用（PTC）子动作、资料访问及完整撤回仍待验。受控检查、安装与原窗口范围分别见[第 9 节清单](<../../../openspec/changes/archive/2026-10-05-add-dsh-buildr-provenance/tasks.md>)、[当前实施索引](<../../../openspec/changes/archive/2026-10-05-add-dsh-buildr-provenance/implementation-progress.md>)；整个 Buildr 观察目标未完成。

历史 v10b 当前关联版本曾经官方桌面命令行（CLI）安装并作限定原窗口验收，[旧安装回执](<../build/source-marker-v10-install-receipt.json>)、[旧产物回执](<../build/source-marker-v10-final-artifact.json>)及[旧浏览器报告](<../build/source-marker-v10-browser-evidence/browser-result.json>)保留其时间和范围。旧 `runtime-entry-9ae7b62df04d77c9` 的当前核心规则（Rule）关联、181 项 Node／12 项原生界面（Native UI）与旧双客户端（Client）检查，不证明本轮当次采集，旧历史未知与真实能力样本缺口不自动消失；公开发布仍未发生。

正常整应用退出／重启随后已完成：原95事件前缀的来源、工具及请求事实保持，恢复总数96，原查询、存储／重开通过，五条来源记录与原技能正文可读。证据见[整应用重启摘要](<../build/capture-whole-application-restart-verified-final.json>)和[重启后原查询](<../build/capture-session-observed-87f8f5b1-d661-47ea-bc08-8c832cb0007e.json>)；不声称事件总数不变，不核销真实技能文件读取、PTC子动作、资料目标或完整撤回。

### 严格来源文件读取的平台边界

来源读取先持有根目录和文件的描述符（File Descriptor），核对内核报告的实际路径，才在同一文件描述符上有界读取；复核文件身份、版本及路径后才解码与发布。授权根使用已观察的固定路径，不因新符号链接重新选择根。macOS 只读调用固定的 `/usr/sbin/lsof`，限定同一进程的两个描述符，禁用域名／端口解析，并限制执行时间和输出；不经命令解释器（Shell）或 `PATH` 查找，不安装辅助工具，核验失败不降级绕过。

Linux 有 `/proc/self/fd` 核验分支，但本轮 macOS 检查没有实际执行该分支；Windows 或内核路径无法核验时，严格来源读取返回相关对象／增强的局部不可用，不改用旧读取策略。既有技能（Skill）、任务读取接口及侧栏 `open()` 沿原政策，助手执行不被此平台限制封锁。实际接口与边界见[公开来源 CLI](<../../buildr/src/modules/agent-assets/interfaces/cli/source-inspect.ts>)和[严格只读文件实现](<../../buildr/src/infrastructure/filesystem/verified-readonly-file.ts>)；未据此宣称所有平台与竞态风险均已验证。

### 智能体选择公开只读能力

智能体（Agent）先核对当前安装的公开帮助及 `agent-assets source inspect` 契约。独立命令不要求网页服务运行，不调用 `open()`，不修复投射或逐条人工上报。

`buildr agent-assets source inspect --target <workspace-or-cwd> --input <file|-> --json` 接受 `buildr.agent-asset-source-observations/v1`，返回 `buildr.agent-asset-source-result/v1`。例如本轮采集用的无正文输入：

```json
{"schemaVersion":"buildr.agent-asset-source-observations/v1","scope":".","mode":"metadata","observations":[{"id":"captured-core","type":"file","locator":{"path":"AGENTS.md"},"observedDigest":"sha256-<actual-file-digest>"}]}
```

实际摘要必须来自当次读取，示例占位不可执行；当前资产判断不自行构成历史证明，只有生产者（Producer）当次核验后随原事件保存才进入本轮观察。未指定 `mode` 时保持原 `content` 返回；查看端不调用该能力。普通用户资料不发送正文，来源与成功／失败分开；输入、输出及单项字节上限、严格文件核验及局部失败仍由公开契约规定。

实现依据：[公开 CLI](<../../buildr/src/modules/agent-assets/interfaces/cli/source-inspect.ts>)、[来源协议](<../../buildr/src/modules/agent-assets/application/source-observations.ts>)、[采集提供者](<source-capture.ts>)、[原事件映射](<src/source-records.ts>)与[共享读取器](<src/source-reader.ts>)。资产和任务模块继续承担各自事实权威。

### 浏览器检查入口

从本服务根目录运行 `test/integration/build-source-ui-browser.ts`，显式提供 `BUILDR_DSH_SOURCE_UI_SDK_ROOT`、`BUILDR_DSH_SOURCE_UI_RELEASE_CLIENT` 与 `BUILDR_DSH_SOURCE_UI_DEV_CLIENT`，分别指向本轮就绪的软件开发工具包（SDK）和两个已编译客户端（Client）。随后运行 `test/integration/run-source-ui-browser.ts` 与 `test/integration/run-source-ui-browser-layout.ts`；两者均要求 `BUILDR_DSH_SOURCE_UI_CHROMIUM` 指向已准备且可执行的 Chromium 绝对路径，不下载浏览器、不猜版本目录。使用已选择的 Node 运行这些入口，报告记录精确运行时（Runtime）路径及客户端产物摘要。

这组检查使用正式组件（Component）、两个实际编译产物和受控原事件／远程调用（RPC）数据；覆盖零默认来源查询、原片段和能力正文边界、详情关闭、状态保留、宽窄布局及输入区上方可读性。结果位于 `build/source-ui-browser`，旧结果须先保全。它不代替实际桌面、会话保存重载或真实插件安装验收。

## 构建与安装

既有已交付侧栏插件（Plugin）的旧输入保留在[基线清单](<../tools/sdk-baselines.ts>)中，默认旧基线为 `0.2.0-rc.1`。清单也登记未增强的官方 `0.2.0-rc.2`；版本号和提交本身均不提供两个新孔。当前增强源码的构建必须显式给出经[源码 SDK 准备器](<../tools/prepare-source-sdk.ts>)验证的 `--source-sdk`，旧基线不能靠声明占位或类型强制兼容它。

研究基线为 `dsh-v0.2.0-rc.2` 的 `639ed015397290b3745d163aafe02ffee4aa3f84`，现装构建 `5e9e301dd9dc8923b2762f76dacfc5751f6ca851` 与它不同。增强输入来自[源码补丁与清单](<../sdk-patches/README.md>)；本轮 v2 补丁与清单为 `dsh-v0.2.0-rc.2-event-sources.patch`／`.json`；旧 v1 轨迹补丁及 SDK 保留原边界和历史字节。普通 rc.2 不能被称为已支持增强 API。

从本服务（Service）根目录，使用指定兼容 Node 和外部已核验输入；示例不固化本机路径：

```sh
node tools/prepare-source-sdk.ts --source <exact-upstream-checkout> --manifest sdk-patches/dsh-v0.2.0-rc.2-event-sources.json --node <selected-compatible-node>
node tools/build-plugin.ts --source-sdk <prepared-source-sdk> --output <owned-candidate-root>
node tools/verify-plugin.ts --source-sdk <prepared-source-sdk> --bundle <owned-candidate-root>
```

准备器从精确上游归档与保全补丁重建源树，生成主机端（Host）远程声明、客户端（Client）类型、轨迹浏览器及选定生产者实体产物后，原子发布 `buildr.dsh-source-sdk/v2` 就绪回执（Receipt）；构建会复核源、补丁、声明、API 检查与产物摘要值（Digest），不是只看 `status: ready` 或版本标记。可复现 SDK 准备通过不等于 Buildr 客户端完整编译、真实组合或桌面部署通过。准备失败的回执不能作为构建输入。

正式版和开发版均消费明确源码输入；开发版额外使用 `--dev`。候选产物未完成当前检查前不压缩、发布或安装。发布准备现已按 `prepare --source-sdk <prepared-source-sdk>` 将同一源码输入与独占产物传给构建／验证，并记录基线、补丁与生成声明依据；尚未实际运行此发布准备，不能凭接线完成宣称候选已生成或已公开。独立发布边界见[发布说明](<../../../knowledge/docs/flows/dsh-plugin-release.md>)。

输出压缩包（Tarball）只有预编译主机端、客户端、类型、组合补丁、说明和许可证。`cordis.patch.yml` 以 `insert` 注册默认启用的 `buildr` 条目；没有本机绑定、凭证、安装脚本或 TypeScript 源码。

公开 npm 安装前，先核对用户实际使用的 DSH 版本及相关依赖。用户已指定插件版本时核对该版本；未指定时，先查询公开标签（Dist-tag），再核对目标版本的精确版本及对等依赖（peerDependencies）：

```sh
npm view @buildr-ai/buildr-dsh-plugin dist-tags --json
npm view @buildr-ai/buildr-dsh-plugin@<目标版本> version peerDependencies --json
```

以该公开版本的对等依赖（peerDependencies）范围对照实际 DSH 版本及相关依赖，包含预发布版本的范围语义；不能只凭包存在、标签名称、版本号相近或本文编译基线判断兼容。本机构建和待发布候选不能作为已公开版本的证据。没有兼容的公开版本时停止安装，说明具体差异，不自动改用开发包或降级 DSH。查询返回 `404` 或 `E404` 表示目标包或版本不可用；网络、代理、认证错误或超时表示查询未知，不能当作未发布，版本事实确认前不安装。

确认兼容后，在 DSH 桌面版的插件界面安装 `@buildr-ai/buildr-dsh-plugin`，或由智能体（Agent）调用其受支持的桌面插件管理入口。通过实际入口支持的参数指定精确版本；安装后回读包名、版本与实体文件。`desktop` 配置档（Profile）仍由桌面应用管理：当前官方桌面运行时（Desktop Runtime）的 `runtime/cli/bin/dsh` 通过桌面主机入口具备 `manageDesktopProfile: true`，支持该配置档的插件管理；不具此能力的通用／npm 命令行（CLI）入口仍拒绝。先核对实际入口及帮助，不手改配置档（Profile）、自行打开权限或增加兼容豁免。

发布前可把生成的 `.tgz` 安装到隔离的 DSH 配置档（Profile）验证。安装、禁用和卸载由 DSH 插件管理器完成；正常用户安装不需要 `buildr runtime dsh-plugin prepare`。开发版在同一根目录使用 `node tools/build-plugin.ts --dev --source-sdk <prepared-source-sdk> --output <owned-candidate-root>` 单独生成，不向公众发布。

构建、装载器（Loader）验证、安装、运行激活与真实桌面验收是不同证据。官方桌面命令行（CLI）退出 0、包已安装且选中，只证明安装事实，不等待热更新（HMR）或就绪；不能据此称当前窗口已换代。首次组合安装可能热更新（HMR），须另外取得宿主（Host）条目与客户端（Client）贡献实际就绪及新当次来源保存／重载／原查询依据。直接覆盖已加载的同名入口可能受模块缓存影响；按受支持管理器结果与运行事实决定是否需重启，不以刷新页面代替。授权修复可以保留旧压缩包（Tarball），移除旧组合后安装内层目录按内容摘要值（Digest）命名的新实体包；包名、客户端工厂（Client Factory）和版本门禁保持。失败从已保全产物恢复，不手改归档、配置档（Profile）或另起宿主（Host）掩盖状态。真实桌面验收仍须核对三入口、侧栏按钮和页面行为。

本机开发试用由[开发组合构建器](<../tools/build-development-composition.ts>)生成私有包 `@buildr-ai/buildr-dsh-development-composition`，显示名称为「Buildr 开发版」。组合根只承载组合补丁（Composition Patch）；内层开发入口、官方轨迹和选定生产者保留各自真实包名及公开服务／客户端工厂（Client Factory）身份，不注册替代业务别名。安装使用包含实体文件及根依赖的压缩包（Tarball），不把缺依赖的构建目录当运行时链接；从链接安装改为同名实体包时，运行中的 Node 模块装载器（Module Loader）可能仍复用旧链接解析，不能靠重命名内层目录修复。首次安装独立组合根可避免旧入口安装根的解析残留；已装组合的后续更新仍按管理器结果处理重启。禁用此组合恢复旧开发入口与原轨迹，不改 DSH 应用文件、会话日志（Session Log）或当前 Buildr 安装。

本轮 v2 组合的 `--host-config` 只保全实际激活的 Tools／AgentLoop／Skill 三个根拥有者：原始 `config`／`disabled`／`inject` 和已观察状态分开记录，不回填解析默认值或将条件平化。其余五模块仍在同一实体图中，由公有配置编辑器（ConfigEditor）仅修改实际预设（Preset）的五个模块引用，保持原配置、表达式、隔离与预设身份；根层停用五条不强开，也不把整预设或凭证带入候选。配置比较、当前预设无 `broken`、适用新作用域（Scope）和撤回五叶分别验证；仅预设叶更新且原 `AgentLoop` 未卸载时，已有智能体（Agent）保留已绑定版本。本次三个根服务停换触发热重载（HMR），释放旧 `AgentLoop` 拥有的运行智能体并从列表撤下；原会话（Session）已由公开元数据（Metadata）接口确认仍在持久存储，随后受支持恢复已验证；范围见实施索引，不承诺恢复后的日志字节不变。卸载图前先经官方编辑器比较后恢复引用，用户漂移不覆盖。构建不证明这些现场动作完成。

当次采集交付使用分阶段组合（Composition）：先 `--host-stage graph-only` 保留原根服务，实体图与原轨迹／入口／设置贡献均使用内容地址；临时变更入口仅在插件管理页 `plugins.item`「来源接入验证／执行」卡片，通过无参数公有远程调用（RPC）明确执行固定五叶计划，安装不自动编辑，不注册 `sidebar.footer.action`。全部适用预设当前版本及运行行核对后，才同包正常更新启根服务，引用存在时不先移除图。根服务停换的实际热重载（HMR）残留需要正常重启另验。完整撤回先退回graph-only、保留图并恢复原根服务及必要重启，再比较恢复五叶并验证原版本可用，最后才卸载图；过渡期间不运行新工具。构建、预设接线、根激活、保存重载及三入口现场分别保全证据。公开 `apply` 成功后须立即取得 `ConfigEditor.documentPath` 元数据（Metadata）及 `configuration()` 的继承／覆盖摘要和存在标志，确认实际持久拥有者；官方移除、添加及冷启动须逐阶段独立复核，不能以暖态挂载版本替代当前持久声明。

此前57事件、CLI同根识别修复、安装后激活待证及第三方冷启动互操作失败的时间线，保留在[实施索引](<../../../openspec/changes/archive/2026-10-05-add-dsh-buildr-provenance/implementation-progress.md>)。旧判断只描述当时已取得范围，不作为当前未完成结论。精确[最终组合](<../build/capture-event-sources-development-bin-paired-artifact-final.json>)、[280文件安装字节核验](<../build/capture-source-development-bin-paired-installed-bytes-final.json>)、[实际加载器入口](<../build/capture-preset-inventory-observed-19c4c85d519e4ef8951f4bd7b3d0a844.json>)和[客户端生成差异](<../build/capture-development-bin-client-generation-delta-final.json>)分别证明产物、安装、激活及编译差异，后续真实能力和95前缀整应用重载结果见上方当前证据，不互相冒充。
