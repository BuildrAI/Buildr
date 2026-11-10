# Buildr 测试与验证框架

Buildr 产品使用四类检查：静态检查（Static Check）、单元测试（Unit Test）、集成测试（Integration Test）、端到端测试（End-to-End Test，E2E）。日常开发按用户目标选齐相关检查，推送前取得四服务全部静态检查（Static Check）与单元测试（Unit Test）的有效完整证明。发布核对准确交付物及真实平台差异，不另造第五类测试。

本页解释产品自身执行方式；[项目声明](../../../verification.yml)公开少量稳定入口，[准备声明](../../../preparation.yml)记录真实准备命令。四服务是 `buildr`、`buildr-web`、`buildr-agent` 与 `dsh-plugin`，成员发现、类型和相关选择由[实际执行登记](../../../services/buildr/test/verification/registry.ts)与项目程序负责，不在说明和地图各复制一份文件清单。

## 三层职责

| 层次 | 负责什么 | 与下一层的关系 |
| --- | --- | --- |
| Buildr 产品提供的通用项目测试能力 | 测试建设技能维护项目自己的测试与`verification.yml`；验证技能选择并执行项目入口，应用保存可选任务报告。 | Buildr 自身是使用这套能力的一个项目；普通用户项目不必采用Buildr内部执行器。 |
| Buildr 项目的具体测试框架 | 四服务检查登记、发现与选组、准备、依赖调度、多维资源、隔离执行、内容适用性、失败与计时证据。 | 日常开发与发布都消费这些检查；测试类型本身不构成阶段屏障。 |
| Buildr 发布编排 | 冻结准确来源和原包，选择所需源码/原包/平台检查，消费有效证明，再执行另行授权的发布动作。 | 不复制第二份测试清单，不把源码成功当作原包或跨平台成功。 |

具体执行从`cli.ts`取得请求，经`planner.ts`与`registry.ts`选组；`plan-runner.ts`组织准备、上下文和执行，`dag-scheduler.ts`只在依赖与预算允许时准入，`executor.ts`调用真实检查。`resource-coordinator.ts`协调跨执行租约；计时、覆盖及内容适用性分别保留原始结果和有效复用来源。各模块位于[验证实现目录](../../../services/buildr/test/verification/)，正式任务报告仍由应用保存。

这些入口和策略以所在检出目录为准；任务工作树的候选实现不代表当前已安装或主开发检出目录已采用。

## 四类检查

| 类型 | 证明边界 |
| --- | --- |
| 静态检查（Static Check） | 类型、源码依赖、声明、资源及交付结构，不执行业务流程。 |
| 单元测试（Unit Test） | 真实内部逻辑或完整内部功能，外部协作者被替换，不验证真实数据库、网络、文件存储、Git 或外部程序。 |
| 集成测试（Integration Test） | 代码与真实技术设施或协议配合，只准备本次需要的边界。 |
| 端到端测试（End-to-End Test，E2E） | 从实际命令行或页面入口贯穿应用链路并核对最终结果。 |

单元测试（Unit Test）不限定一函数或一类，完整集合须低成本、易准备。真实 SQL 的内存数据库仍是数据库边界，普通内存仓储替身不是。测试运行器读取源码、创建工作进程不等于被测业务经过外部协议。旧目录、工具名和执行阶段不决定类型；混合检查按实际证明拆分，保留断言。操作系统差异和准确交付物分别说明运行条件与被测对象。

## 公开入口

在 `services/buildr` 使用 `tools/development/run-development-npm` 调用下列入口；其他服务独立运行沿用自身项目包装方式。所有入口都提供 `--plan` 查看选择，`--check <id>` 显式指定检查；计划和选择成功均不能代替真实执行。

| 需求 | 入口 |
| --- | --- |
| 四服务全量单元测试（Unit Test） | `npm test` |
| 推送前四服务全部静态检查（Static Check）与单元测试（Unit Test） | `npm run check` |
| 四服务全量静态检查（Static Check） | `npm run test:static` |
| 全量集成测试（Integration Test） | `npm run test:integration` |
| 全量端到端测试（End-to-End Test，E2E） | `npm run test:e2e` |
| 集成与端到端共同调度，覆盖两类完整并集 | `npm run test:system` |
| 按用户请求、实际文件或改动选择相关四类检查 | `npm run test:related` |

用户可指定具体检查、类型、全量或相关范围，不要求先创建正式任务或先提供 Git 基线。已知检查直接执行；需要比较才使用明确来源。相关选择须依据实际公共行为、调用方、依赖及交付边界补足自动路径选择，零匹配不能冒充目标已验证。

`--list` 列出检查标识，`--plan` 或 `--json` 只查看计划。`test:related -- --base <ref> --check <id>` 在相关集合中追加显式检查；只有 `--check` 时直接执行指定集合。`check` 包含全部不依赖外部运行时的源码静态检查（Static Check）与单元测试（Unit Test），添加 `--check` 不会缩小推送前范围。

静态检查（Static Check）同时检查四服务测试及辅助脚本：JavaScript 做语法解析，TypeScript 做严格类型检查。`test-typecheck` 检查主体、网页和智能体测试，并随 `npm run check` 自动执行。`plugin-typecheck` 与 `plugin-test-typecheck` 使用准确的软件开发工具包（SDK）与已生成的协议声明，按入口分别检查插件宿主端和客户端，避免两端同名类型相互干扰；它们依赖本机准备的外部 DSH SDK，登记为仅显式选择，由插件服务自己的 `test:static` 与发布/候选验证（`tools/verify-all.ts --source-sdk`）执行，不进入日常全量检查。

## 测试内容与并行

分类落实到实际断言。来源选择、迟到响应、状态合并、筛选和尺寸计算直接调用生产逻辑，以替身隔离外部协作者；真实 Git、文件写盘、HTTP 与冲突边界由集成测试（Integration Test）验证；浏览器端到端测试（E2E Test）保留必要完整使用流程。删除重复高层组合前核对已有低层证明并补齐缺口，不能以改名或单纯删断言降低耗时。

`test:system`把两类检查放入同一依赖计划，复用本轮准备及总资源预算；测试类型不是阶段屏障。它仍是两类检查的组合入口，不新增测试类型。无需分别启动两个会相互争抢机器的命令；真正依赖、独占和具名资源锁继续生效，因此总耗时不保证等于两类中较长的一类。

非CI默认使用`local-auto`，按可用CPU并行度和内存形成初始预算：每3个CPU、每4GiB一个外层组，自动宽度限制在1至3。全局、工作空间重负载、浏览器与工作空间I/O额度一起调整；为容纳现有双工作进程组，浏览器和I/O至少为2。工作进程额度至少容纳现有单组需求，自动上限16。它是保守初始策略，不是实时CPU、内存或磁盘调节器；额度为测试声明单位，不等于操作系统进程硬上限。实现及固定档位见[容量策略](../../../services/buildr/test/verification/execution-capacity.ts)和[登记](../../../services/buildr/test/verification/registry.ts)。

`BUILDR_VERIFICATION_PROFILE=local`保留原固定档位，CI默认档位也保持固定。`BUILDR_VERIFICATION_JOBS=<正整数>`明确覆盖外层宽度，同时调整相关多维额度，避免只增大全局并发仍被浏览器或I/O挡住；组内并发和正确性资源锁不随之放大。计划与计时证据保存`capacityPolicy`、`capacityObservation`和最终额度，复现时应核对这些字段。

`e2e-browser:code-explorer` 与 `e2e-browser:code` 是文件浏览和源代码管理两个独立检查。源码浏览器检查按上述档位准入，仍受全局进程、工作线程和工作空间读写额度约束；它们共享不可变前端产物，各自使用临时工作空间、随机端口、浏览器和清理责任。其他共享可变资源的检查继续互斥。开始结束时间必须证明实际并行，准备去重不能被误算为测试通过。

兼容选择器可以在确证不引入状态污染、不跳过断言且清理完整时复用同一隔离宿主。当前只合并`core,shell,workbench`为`browser:bundle:reading`：代表步骤执行完整场景，其余成员以零成本结果回填；单独聚焦任一成员时仍保持窄范围。`project+service`因service运行时目录污染、`task+task-materials`因Task列表响应等待超时未采用，继续使用独立现场。调度器在`browser-runtime`有空闲槽位时优先准入待执行浏览器步骤，槽位满后恢复普通成本顺序，避免普通检查被永久饿死。

对话 `history` 的独立成员由 `buildr-web/test/browser/agent-conversations-history-scenarios.ts` 声明，稳定身份形如 `history/workspace-order`。完整运行不再由一个进程承包整个对话组，而是使用两个静态隔离批次：批次A保留`setup,tasks,recovery`顺序并只分配约三分之一history场景，批次B承载其余组和剩余history场景；两个批次各用独立进程与互斥场景集合。每个成员仍新建浏览器上下文和夹具，独立失败同轮收集；领取后崩溃不会自动重放，清理或共享服务状态异常会明确留下未运行项。通过 `BUILDR_AGENT_JOURNEY_PART=history` 和 `BUILDR_AGENT_SCENARIO_FOCUS=<身份，多个用 | 分隔>` 可在同一 `test:e2e -- --check e2e-browser:agent-conversations` 入口定点诊断；未知筛选报错，子集通过不能作为整组通过，coverage会标记focused，失败接续仍选择未完整证明的父检查。较重的服务和生产构建仍由本轮共享，场景结果与耗时保存在现有诊断日志。

对话父组的 `resourceUnits.browser-runtime=2` 与 `workers/processes=2` 记录两个子现场的真实占用；外层按数量准入、释放和估算，物理浏览器租约仍由子进程分别持有，父组不重复申请。`workspaceIo=2` 保证外层预算不会把两个内层现场压成串行。浏览器只有两个槽位，另一个浏览器检查占用时第二个对话批次仍会等待；缓存命中不执行子进程，同时清空数量与资源声明，避免占住其他检查的读写预算。

自动语义关注点区分产品实现与测试路径；测试变化保留真实直接归属，不再仅因文件名包含conversation就追加无关原生进程组。显式 `--tag` 继续扩大集合。内容快照的检出目录身份与交付比较基线分开：基线变化仍比较实际内容，旧成功采用仍须通过配方、发现成员和环境校验。

## 环境准备入口

智能体（Agent）根据实际缺项准备环境，检查命令不隐式下载厂商依赖或激活真实桌面。以下命令均从 `services/buildr` 调用；完整参数和输入校验由对应程序维护。

| 缺项 | 实际准备入口及输出 |
| --- | --- |
| 配套浏览器 | `tools/development/run-development-npm run browser:prepare`，复用同版本缓存。 |
| 插件软件开发工具包（SDK） | `tools/development/run-development-node ../dsh-plugin/tools/prepare-release-sdk.ts --node <Node绝对路径> --pnpm <pnpm脚本绝对路径>`；返回的 `sdk` 通过 `BUILDR_DSH_SOURCE_SDK_ROOT` 提供给检查。工具校验锁定版本与完整性。 |
| 插件构建、对端与宿主组合 | `tools/development/run-development-node ../dsh-plugin/tools/prepare-check-environment.ts --source-sdk <sdk> --buildr-peer <准确原字节清单> --output <准备回执>`；检查消费回执中的 `env`，准备自身不执行测试、不激活桌面。 |

准确对端观察与准备的可执行示例见[持续集成定义](../../../../../.github/workflows/verify.yml)。源码检查与准确原包检查的对象、排除原因及其他系统的缺口会在计划和执行报告中分别列出；准备成功不代表这些检查通过。

## 执行和成本

步骤的`scheduling.waits`记录本轮准入等待区间及当时原因：依赖、全局数量、类别、具名资源、工作进程/I/O容量或独占；同一区间可能有多个原因，不能相加当作墙钟耗时。`resourceCoordination.waitDurationMs`仍单独表示跨执行的租约等待。`workspaceIo`额度覆盖声明的步骤生命周期，不能据此声称磁盘已饱和。

浏览器前置造数据复用同一私有应用适配器，避免重复启动完整CLI；完整初始化、登记、同步和Doctor仍执行，页面业务及场景内CLI断言保留原入口。各组可写环境和服务仍独立，不把共用不可变输入扩大为共用数据库。精确版本命令在完整命令登记装配前读取原身份，减少无关模块加载；其他命令继续完整装配。这两项减少准备工作，不消除Agent启动和测试场景链本身的成本。

网页生产准备可在当前检出目录的 `build/verification-web-dist-cache` 中复用现有准备回执和产物清单；完整源码、生成接口、配方、依赖和工具环境匹配且输出字节完整时，复制到本轮独立输出。缓存损坏或输入变化会重建，结果单独给出重建/复用及准备时长；不读取在线产物，也不代替真实浏览器检查。

准备依实际缺项完成，已有锁定依赖、构建输入和浏览器可以复用，不在每条检查前重装或重复生成。单元测试（Unit Test）不自动准备浏览器、真实账号、付费模型、准确双包或完整厂商软件开发工具包（SDK）。类型检查（Type Check）只证明真实编译范围，不把转译成功或 `noCheck` 声称为严格类型验证。

[HTTP DTO 生成](../../../services/buildr/tools/codegen/contracts/output-paths.ts)比较完整内容后再写入；相同内容保留文件身份和修改时间，变化时通过原子替换发布，已打开的读取者仍持有完整旧文件。[开发依赖准备](../../../services/buildr/tools/development/prepare-development-dependencies.ts)的 Agent 构建与[Agent 包准备](../../../services/buildr/tools/development/prepare-development-agent.ts)共用同一个互斥锁，等待后重新检查已有构建，避免重复构建和读取半成品；其他独立准备继续按原声明执行。

实际工作进程数量和资源必须有界，完整集合的耗时与资源成本需观察并优化，不设统一三十秒门槛，不借无限并发掩盖消耗。自动机器初始宽度和重型组并行均不超过3，浏览器并发固定为2；对话journey使用两个静态隔离批次，而不是同一队列里的两个worker。四路并发曾使15 CPU机器负载达到12至21，并导致真实浏览器等待、Qoder原生对话未结算和进程交接失败；三路以内及互斥批次未再复现。三组及以上的准入仍保留4份工作空间I/O，使两组重型生命周期可重叠。发现慢检查先判断范围与实现效率，不仅因慢而改名，也不为达到预算删掉必要断言。

第二轮完整四类实测：112项选择、106项实际执行、106项通过、6项环境或平台不可用，总墙钟37分05秒；准备39.9秒、执行2155.5秒、复用收尾23.5秒。所有执行项累计102分51秒，global=3下理论下限约34分17秒，实际为下限的108.2%；三路并发占用33分16秒，说明机器接近持续满载。14个浏览器选择器累计31分28秒，浏览器流水从第46秒持续到第1015秒，之后约20分钟由Integration/E2E进程链和末尾独占组构成。对话组502秒中两个批次分别274秒和254秒，只有约26秒重叠，因为`e2e-browser:code`在前241秒占用另一个浏览器槽位；即使两个批次完全并行，浏览器总工作不变，只会把其他浏览器组后移。reading bundle全量139秒，r2三个独立现场合计约155秒。继续提速应优先减少真实重复生命周期或缩短长集成套件，而不是继续压缩对话组或提高默认并发。

智能体服务（Agent Service）的完整集成入口是从 `services/buildr-agent` 运行 `../buildr/tools/development/run-development-npm run test:integration`；它按[服务检查登记](../../../services/buildr-agent/tools/testing/verification-checks.ts)发现全部组，项目完整入口也消费同一登记。`agent-integration` 覆盖本机存储及服务契约，`agent-integration-conversations` 独立覆盖较长的对话生命周期文件；两组成员互斥，完整入口仍发现同一全集。前者申请2个工作进程与2份I/O，后者申请1个工作进程与1份I/O，在原全局额度内并行，避免大文件堵住组内文件队列。`agent-integration-native` 覆盖厂商协议；重型独立进程按启动与归属、跨版本交接、观察与恢复分别归入 `agent-integration-startup`、`agent-integration-handoff`、`agent-integration-recovery`。真实退避上限用例独立归入 `agent-integration-recovery-budget`，避免27秒左右的真实等待挤占恢复组串行预算；保持唯一主归属与完整发现，原恢复组预算不变。使用 `--check` 选择其中一组不能宣称完整智能体覆盖。

重型组每组申请一个工作位，统一资源协调器（Resource Coordinator）以 `agent-process-tests` 限制同机最多两组；组内文件依照外层 `BUILDR_VERIFICATION_WORKER_BUDGET` 串行执行。直接诊断可运行 `node tools/testing/run-integration.ts --group all` 或指定同一检查标识，也服从该预算，最多并行两个文件。准备包由一次执行共享准备；每个用例的可写包、数据库和进程身份独立。

本机执行计划为真实Agent进程组、Archify和嵌套Git组申请最多两份工作空间I/O额度，不再随额度增长而占满全部。四份额度下最多两组重型生命周期可重叠；三份及以下仍保持原互斥，避免在没有足够空间时强行并发。`agent-process-tests`具名正确性锁、组内工作进程与进程预算、其他资源锁和清理责任不随之放大，独立协议和轻量检查可在剩余预算内执行。刷新当前检出目录生成文件的工具边界组仍全局独占。长组耗时估计用于现有成本优先调度，既不是通过证据，也不改变期限；实际重叠、等待原因、墙钟、失败率和清理须由完整运行证据核对。

在本机支持的平台，`agent-integration-startup` 中五个只消费现成环境的场景，由[准备夹具](../../../services/buildr-agent/test/support/prepared-process-fixture.ts)每轮真实准备一次，再复制各用例独立的运行目录，重写私有路径并通过生产完整字节校验。数据库、会话和进程仍独立；种子污染拒绝使用，不跨轮缓存。测试运行环境创建、升级和迁移本身的场景继续真实准备；Windows 保留完整准备路径。

支持的平台使用写时复制（Copy-on-Write）克隆包。完整运行由[只读输入提供者](../../../services/buildr-agent/test/support/immutable-process-inputs.ts)保有一份只读 Node.js 副本，测试运行单元通过硬链接（Hard Link）共用相同程序字节，仍保留独立路径和编译包。可写内容不建立硬链接（Hard Link）。不同 Node.js 字节、跨卷及不支持的平台退回独立副本；Windows 暂不启用硬链接（Hard Link）共用。输入持有者只在运行单元链接全部释放后清理，异常时保留诊断。

生产运行单元继续真实物化并在每次校验时读取全部字节，摘要使用同一个有界缓冲区（Buffer）分块计算，不缓存旧摘要。

重型用例的清理先撤销本用例的原生连接，再关闭宿主并要求后台停止，核对所观察进程已经退出后删除目录；断言失败仍执行同样的清理，退出未确认作为失败报告。默认输出包复制、运行准备、启动、停止、进程退出及目录清理的开始与完成记录；`BUILDR_TEST_PHASE_TIMING=1` 另记录逐次交互耗时；服务集成执行器（Executor）保留逐文件开始、完成和失败类型。外层总限时取消与产品断言失败分别判断。 测试状态清理允许有限次数重新观测已退出进程的关闭窗口，只有明确无占用才删除目录；持续占用或观测不明保留目录和具体诊断。清理失败保留子进程原结果、输出和耗时，整体仍失败；清理观测与子结果写入计时证据。

运行中不改被测源码，一轮收集无依赖的失败，修复后补失败及受影响项。复用须核对内容、配方、依赖、工具和必要环境仍适用，保留实际来源；推送前完整集合的证明不可由仅执行相关部分替代。缺少测试、环境不可用、未执行、失败及待授权分别报告。

代码观察的仓库归属、忽略输出、共享 Git 元数据和批处理矩阵使用真实文件／Git与受控的监听传输替身；原生通知单独在 `source-control-native-observations.test.ts` 中证明，捕获真实回调后原样转交产品，不允许注入事件满足该检查。两份文件由同一 `integration-code` 完整入口发现，减少每个分支的原生冷启动与历史事件回放，不删功能断言或把替身结果冒充平台证明。

## 候选轮次的文件级补验

候选源码轮仍写入 `candidate-round.ts` 的普通结果，不使用跨轮缓存。Node 测试节点失败时，已完成的完整文件可附带输入身份、清理事实和原始执行来源保存。接续从真实声明重新发现全体成员，使用已有输入选择器校验内容、共享实现／夹具、配方、依赖、平台、架构和实际 Node；只补失败、新增或失效文件。共享实现变化会扩大补验范围，无法确定输入时保守重验。命令型编译器或动态扫描器的可执行程序不是源码入口；无法解析实际读取集合时使用完整范围，不能因仅绑定扫描脚本而遗漏测试内容、配置或发现成员。显式 `--invalidate <step-id>` 不采用该节点旧文件证明。

完整节点必须覆盖当前全部成员，不能把补验子集当作全量。缺失或重复完成事件、信号中断、清理失败和运行中输入漂移不产生新文件成功；保留的成功继续指向原运行及原耗时。旧失败结果没有文件证明时首次仍运行完整节点；非 Node 测试入口不伪造文件粒度。

执行日志立即暴露结构化文件失败，不需等后续慢文件结束。普通结果和计时摘要分别记录准备、上下文准备、执行、上下文清理及复用收束耗时；步骤已有资源排队事实继续保留。候选等待另外区分本机回读工作与休眠，远端作业与步骤按实际时间边界说明准备、检查、清理、上传和回读，缺失时间为未知，不把整段统称排队。

## 发布与真实环境

发布仍由 `buildr-release` 冻结准确来源与交付物，验证程序消费同一原包并按实际系统补齐平台差异。源码检查成功不证明原包可安装或跨平台成功；同一原包的成功证据不因阶段改变重复生产。插件对端、软件开发工具包（SDK）及真实宿主按目标按需准备，不把模块逻辑验证扩大为每轮真实桌面安装和卸载。

真实账号、外部写入、付费模型与公开发布保持原授权边界。验证环境就绪不证明业务结果，浏览器自动化成功不等于人工视觉审查（Visual Review）。只在确有授权或业务取舍缺口时，把具体对象、影响、已完成工作及待决定事项反馈用户；缺一个环境不阻断其他安全检查。

## 智能体职责

[测试建设（project-testing）](../../../services/buildr/resources/workspace/skills/buildr/project-testing/SKILL.md)统一维护测试代码、项目入口、发现与选择映射和 `verification.yml`；[项目验证（project-verification）](../../../services/buildr/resources/workspace/skills/buildr/project-verification/SKILL.md)依据请求选择、实际执行、交付证据并按需记录已有任务报告。准备声明维护归 `buildr` 的[准备指引](../../../services/buildr/resources/runtime/skills/buildr/references/preparation-declarations.md)，不再设置声明中转技能。

正式报告仍使用 `task verification inspect|record` 和原内容摘要冲突保护；没有任务时直接交付真实证据，不补造任务或报告。推送前检查不授予 Git 写入授权，发布验证不授予公开发布授权。

## 项目验证与发布的消费边界

通用项目测试能力只维护测试地图和任务报告；本项目的执行登记、候选轮次及准确原包机制不成为用户项目的前提。发布通过 `test/verification/release-verification.ts` 消费检查覆盖和证明传输，覆盖契约在 `release/release-consumption-contract.ts`，包的真实执行仍由原消费入口承担。检查输入计算位于 `candidate-check-inputs.ts`；发布侧只保留产品构建输入和受保护执行来源绑定。

`result-applicability.ts` 比较内容、配方、环境及 Git 输入身份，日常复用与候选采用共用这一基础判断。轮次、平台及来源政策保持独立；新候选仍完整执行。候选记录可携带执行前后稳定的输入身份，历史记录保留原样，无法证明适用性时只补必要检查。插件源码执行与就绪核验共用服务拥有的 `source-phase-definition.ts`，避免两边生成不同配方。

验证执行器不直接加载发布产包实现；计划需要原包生产或消费时，组合入口才提供 `package-adapter.ts` 的适配。准备需求从检查级索引取得，仍由同一候选声明投影，不维护第二份成员表。执行前准备、执行后内容核验和独立清理责任继续保留。

## 应用行为测试的进程边界

一次 CLI 冷启动约 1.6 秒，主要成本是模块图加载而不是命令本身。只验证应用行为的旅程（任务、项目、同步等）不再为每条命令启动新进程：`test/helpers/in-process-cli.ts` 调用生产入口 `runCli`，接管标准输出、标准错误与退出状态，保留原参数、输出与错误映射。

真实进程契约仍然保留，并按实际边界划分：`init`/`sync` 的运行时投射需要派生子 Buildr 调用，继续走 `bin/buildr.mjs`；`init-onboarding`、`repository-onboarding`、`cli-compatibility`、`task-commits` 与浏览器、Agent 宿主检查继续验证真实进程。转换后的文件各自保留一次真实进程对照，比较同一条只读命令的真实与同进程 JSON 输出。

同进程执行只在命令之间没有进程级隔离依赖时使用。已观察到工作空间登记缓存等状态可能跨命令保留，因此转换按文件逐一验证，不能一次性替换共享夹具。
