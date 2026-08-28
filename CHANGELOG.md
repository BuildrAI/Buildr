# Changelog

本项目遵循语义化版本。正式发布前的变更可以在 `0.1.x` 内调整，但会在 release notes 中说明用户可观察差异。

## Unreleased

## 0.1.0-rc.27 - 2026-08-27

- 修复多 Project 正式任务流程：保持单一 Task Content Target、Candidate、Verification Result 与 handoff，同时按 Project 独立形成 Verification Plan、声明和 Execution Record，并完整聚合验证与当前知识结论。
- 加固 Task Environment 与 Task Finish 的多 Project 恢复边界，避免共享环境或单 Project 证据被误判为完整任务闭环。

## 0.1.0-rc.26 - 2026-08-27

- 以当前 `dev` 快照重新准备候选版，延续 rc.25 已交付的 Task Finish、release identity 与 main reconciliation 收敛。
- 保持候选版使用 npm `next` 轨道，版本材料与 package/lockfile 元数据一致。

## 0.1.0-rc.25 - 2026-08-27

- 修复多仓库 Task Finish 终态持久化，并补齐相关运行时接口与集成验证。
- 收敛 release、Task Finish 与治理场景的 current identity，修复 Doctor readiness 与归档治理 delta 的误判。
- 支持 release→main 的 merge commit 收敛，保留 release selection 与 main reconciliation 的独立 provenance。

 ## 0.1.0-rc.24 - 2026-08-26

- 收敛发布准备与收尾编排：发布后改为只读核验 dev 来源，并支持 Candidate 失败分片按同一 run 定点重跑，减少重复执行和跨 run 拼接证据的风险。
- 加强正式任务交付完整性与收尾准入：补齐 Contribution 路径覆盖、终态载体清理、Environment cleanup 和 retained controller 的可恢复证明。
- 完善正式验证与任务研发边界：收敛 Verification runtime、Preparation Plan、Task Development discover 与复盘流程的 current identity 和闭包。
- 调整候选版准备引导：未指定发布基线时先解析最新 `dev` 的精确 commit/tree，展示完整方案并等待确认，确认后固定发布快照。

## 0.1.0-rc.23 - 2026-08-25

- 将 Workspace 验证升级为 `Test Capability Family → Verification Request → Verification Plan → Execution Record → Verification Result` 闭环：Project `verification.yml` 使用 v3 能力族声明，支持 affected/full 选择、command 与高级 provider 执行，并保留 v2 兼容读取以安全完成自举迁移。
- 优化长流程的可恢复观测：Verification、Release、Task Retrospective 与 self-bootstrap 默认返回有界摘要、周期进度和稳定 recovery pointer，完整专业证据继续由原 owner 保存与回读。
- 统一 Release Task 生命周期：唯一 `release-<version>` 协调 Task 覆盖 selection、Candidate、唯一 tarball、release→main、readiness、Publication、main→dev 与 closeout，版本材料和候选修复由独立 support Task 交付；冻结集合支持保留历史 generation 后受控 reopen/refreeze。
- 修复 v3 验证迁移后的声明版本提示硬编码，并加强 release correlation、Environment cleanup 与验证结果恢复的 current identity 边界。

## 0.1.0-rc.22 - 2026-08-24

- 重构 Buildr 的智能体优先治理与服务架构：收敛 Bootstrap、Task、Workspace、Runtime Host、System Installation、Agent Assets、HTTP contracts 和 TypeScript 执行边界，并让 Core、专业能力与模块依赖保持宽而薄的职责划分。
- 完善 Parent Task 与研发证据流：引入结构化 Parent Plan、Contribution Handoff、Planning/Completion Review、current knowledge 与正式 Verification 的 current identity，改进 Buildr Web 的 Parent 概览、任务引用和 UI Prototype 工作流。
- 建立新的 release 集合与受保护发布链：以精确 dev baseline、逐 commit provenance、release HEAD Candidate、唯一 tarball、Task/Environment/Finish/self-bootstrap correlation、shared readiness 和 release→main/main→dev 收敛替代旧的“最新 dev 自动成为候选”流程。
- 加固 Agent 主导的 Task Finish 与恢复：支持真实远端交付对账、多仓库部分交付、target race、清理投影、失败 run 恢复和隔离 smoke，保持 Delivery、Activation、Cleanup 与 Diagnostics 正交。
- 优化 Product 验证成本与证据所有权：确定化 Environment preparation，拆分 affected/full/Candidate 范围，引入可复用 Test Context Runtime 与 prepared fixture providers，并收窄日常验证输出和调度预算。
- 统一 Buildr Web 命名与本机实例生命周期，保持 npm/development channel、Launcher 接管和兼容 identity 的明确边界。

## 0.1.0-rc.21 - 2026-08-20

- 收敛正式工作流运行时闭环：canonical Workspace 写入来源绑定真实 retained controller，npm artifact 自包含 Task Development、Task Retrospective 与 Task Planning Identity 内部路由，并由 package validation、Doctor 与安装产物测试共同检查；Verification 公共 JSON 改为有界摘要，完整输出继续保存在 Execution Record。
- 加固 Candidate 执行与证据：capability 运行时即时报告完成、周期心跳、独立墙钟超时、TERM→KILL 进程组回收和原子增量 checkpoint；macOS core 与 Windows lifecycle 按语义拆分并行 shard，稳定 `Candidate gate` 仍只接受同一 source、唯一 artifact 和全部 terminal shard 的 closed evidence。
- 修复 hosted Host Node 与 Launcher readiness：最低/current Host Node tuple 使用各自实际 Node 作为父进程与子进程 PATH authority；macOS Launcher 使用独立 15 秒 readiness budget，并在失败清理前保留脱敏 instance、process、log、elapsed 与 Node audit。
- 扩展发布 transaction 关联证据：正式 runner 绑定 completed release/support Tasks、Task Environment Plan/Receipt、权威 Service preparation recipe、Candidate run、main/dev、tag、npm/GitHub Release 与 Registry smoke；preparation input identities 始终按最终冻结 source commit 校验，并支持按 publish run 校验、回读和清理 portable evidence。
- Buildr Web 的 Task 概览不再展示本机每日演进反向关联，Project 详情中的“每日演进”入口保持不变。

## 0.1.0-rc.20 - 2026-08-19

- 放宽 Buildr 自举 Workspace 的后继激活门禁：Formal Finish 冻结提交之后，只要最新 `origin/dev` 已发布、线性包含该提交、没有 merge、Workspace 干净且本地与精确远端一致，self-bootstrap runner 即可在最新提交上继续激活，不再要求协作者提交携带 `Buildr-Task` 或 closeout trailer。
- 将“宽而薄”固化为 Core 与 Product 的治理原则：硬门禁继续保护 authority、目标、副作用与完成证据，但不再把辅助 provenance、推荐工具或可恢复不确定性当成独立阻塞；target lease、foreign carrier、same-run resume、remote drift、development entry、Node `24.15.0` 与最终 Doctor 约束保持不变。

## 0.1.0-rc.19 - 2026-08-19

- 增加 Project 每日演进能力：通过 `buildr project daily-progress` 记录 Git 驱动的当日推进，并在 Buildr Web 的 Project 与 Task 详情中展示关联演进。
- 重构 Buildr Web 的本机工作台壳层与主导航，支持工作空间切换；任务详情补充任务文档引用、文档预览、Parent/Child 协调进度和每日演进关联。
- 增加界面预演与任务文档引用的可读入口，帮助 Agent 和维护者在正式实现前后对齐 proposal、design、brief 等重要材料。
- 加固多仓库 Task Finish 与 self-bootstrap 的目标租约、最新 `dev` 收敛、交付载体隔离和 retained CLI/Doctor 身份校验，降低并发收尾与自举恢复中的误交付风险。
- 收敛 Buildr Web development/released channel 隔离、Workspace 管理和发布感知相关的运行时与验证契约，继续保持 npm-only 分发和 Host Node `>=24.15.0 <25` 兼容范围。

## 0.1.0-rc.18 - 2026-08-16

- 包含未公开发布的 `0.1.0-rc.16` 与 `0.1.0-rc.17` 候选内容；将 Product checkout 的 development Node 固定为 `24.15.0`，并把 development CLI、npm wrapper、验证、Task Environment 与 self-bootstrap 统一绑定到该 retained Node；npm package 继续只声明兼容的 Host Node 范围。
- 移除 Workspace Node 的通用依赖与旧运行时探测，收敛 workspace、Doctor、Task Finish、Verification、发布包和 Buildr Web 对新 Node ownership 边界的实现与契约。
- 更新跨平台 Candidate 与发布相关验证，修复干净检出和 Windows 下 development npm/build wrapper 的执行问题，确保 development entry、npm 安装、Task Environment、发布 payload 和 Windows/macOS smoke 使用一致的 Node 与入口身份。
- 修复 `0.1.0-rc.16` squash merge 后遗漏的 `main → dev` 历史衔接；在保持候选内容不变的前提下，从已收敛的 `dev` 为 rc.18 重新建立 self-bootstrap、Candidate、history bridge 与发布 transaction 证据链。

## 0.1.0-rc.15 - 2026-08-16

- 将正式发布收敛为一次 `publish.yml` transaction：可逆的 contract、唯一 tarball、Host Node 与 Launcher 门禁通过后，只请求一次 `npm-production` 审批，并在同一个 protected job 中完成 OIDC authority probe、pre-tag convergence、tag ensure、npm publish、dist-tag/integrity 回读、GitHub Release 与官方 Registry 安装 smoke。
- 调整发布候选收敛顺序：Release Task Finish 后先运行唯一 self-bootstrap activation，再冻结 `origin/dev` commit/tree；pre-main、`dev → main` Candidate 与历史衔接共同消费该 tree，bridge 必须校验 matching Finish run 和临时 activation evidence，避免先衔接历史再补做自举激活。
- 加固发布恢复与验证契约：tag 改为 protected transaction 内的 `preflight|ensure` 语义，发布 runner 只 dispatch 一次正式 transaction；同步更新 authority、convergence、history bridge 与 Candidate affected owner 的契约测试。

## 0.1.0-rc.14 - 2026-08-16

- 修复发布契约在干净 GitHub runner 安装依赖前的冷启动：版本解析迁入无外部依赖的 Domain 模块，避免 `yaml` 尚未安装时在任何公开写入前确定性失败。
- Formal Task Finish 在放弃尚未交付的 run 时释放其隔离载体占用，并在推荐 Finish 前复核关联 Change 已归档，避免陈旧状态阻塞后续收尾。
- 明确协作者推送后的处理边界：远端更新没有本地 Task 属于普通 Workspace update；更新后以 Doctor 判断并执行 workspace sync，只有持有 matching Finish Result 的自举收尾才进入 self-bootstrap runner。

## 0.1.0-rc.13 - 2026-08-15

- 增加稳定版与候选版发布感知：CLI、Doctor、Buildr Web 和内置 Skill 共享安装来源、用户选择的发布轨道及 npm `latest`/`next` 状态；npm 安装可显式选择 stable 或 candidate，development checkout 保持独立且不改写机器默认 `buildr`。
- 增加 Formal Task 紧凑入口与 Finish 交付回读：`buildr task next` 只读聚合 Task、Environment 与 Development 的 current 最小事实，Finish 可按 Task 回读结构化冲突路径，并在自举 target race、foreign carrier 与 successor 激活场景中执行有界恢复。
- 为 OpenSpec convergence 与 Formal Verification 增加语义就绪预检，区分阻塞、安全前置与推荐动作，避免为下游阶段重复装配完整上下文或在事实未收敛时启动昂贵验证。
- 扩展 Task Retrospective 与 Verification 恢复能力：支持批量只读复盘检查，恢复 orphaned execution records，并修复 migration 契约基线。
- 优化 changed/affected 与分布式 Candidate：先执行 admission 检查再展开受影响计划，闭合浏览器开发反馈，按 domain 拆分高成本 owner 与 shard，同时保持 `Candidate gate` 对同一 source、唯一制品和全部平台证据的完整聚合。

## 0.1.0-rc.12 - 2026-08-15

- 包含 rc.11 已验证候选中的 Buildr CLI 安装通道隔离、Buildr Web、自举激活、Formal Task Finish、Verification、分布式 Candidate 和唯一 pre-tag OIDC authority probe 等改进；`v0.1.0-rc.11` tag 保持不动，但其 workflow 在任何 npm 写入和 GitHub Release 创建前失败。
- 修复产品发布包携带开发仓用户态配置源的问题：`.buildr/workspace.yml`、Workspace registries、Project `capabilities.yml`/`commands.yml` 和 Service registry 不再进入 package target、Application Payload 或 npm tarball。
- Workspace 初始化、Project 创建和同步更新现在通过对应 Domain writer 生成缺失的 schema-valid 空配置，再从 package 声明收敛 Builtins 与 Components；已有用户配置保持用户 ownership，不从产品开发配置复制或覆盖。
- 增加 package static、初始化/同步、Application Payload 和真实 npm candidate inventory 契约，持续拒绝用户态配置源回到发布物；同时修复 rc.11 publish job 在重新校验 frozen payload 时因缺失 `resources/product/package/targets/workspace/.buildr/workspace.yml` 而失败的根因。

## 0.1.0-rc.11 - 2026-08-14

- 包含 rc.10 已验证候选中的 Buildr CLI 安装通道隔离、Buildr Web、自举激活、Formal Task Finish、Verification、分布式 Candidate 与唯一 pre-tag OIDC authority probe 等改进；`v0.1.0-rc.10` tag 保持不动，但该 tag workflow 在任何 npm 写入和 GitHub Release 创建前失败。
- 修复 tag publish 的 Host Node jobs 下载冻结 candidate artifact 后只传入 tarball 与 `npm-pack` metadata、未传入 `release-artifact.json` 的输入契约缺口；最低与当前 Node 24 runner 现在都显式核对同一 manifest、application payload digest 和 immutable tarball bytes。
- 扩展 publish workflow contract test，把 tarball、pack metadata、release manifest 与 verifier 顺序作为闭合门禁，避免 GitHub Candidate adapter 与 tag-only workflow 再次发生 wiring 漂移。

## 0.1.0-rc.10 - 2026-08-14

- 包含 `0.1.0-rc.9` 候选中已经完成的 Buildr CLI 安装通道隔离、Buildr Web 产品表面、自举激活、Formal Task Finish、Verification 与分布式 Candidate 改进；rc.9 的公开 tag 保持不动，但该版本没有写入 npm Registry 或创建 GitHub Release。
- 修复 tag publish 的独立 Host Node jobs 未安装 checkout verification harness 依赖而确定性失败的问题；最低支持 Node 与当前 Node 24.x runner 现在都依据 package lockfile 独立执行 `npm ci`，随后验证同一冻结正式 tarball，不跨 job 复用 `node_modules`，也不重建候选制品。
- 将 GitHub-hosted OIDC authority probe 收敛到正式发布授权后的唯一 pre-tag 门禁：候选准备只完成无 hosted evidence 的 `post-main` source convergence，不再提前触发 `npm-production` 审批或重复 token exchange；发布时的 current evidence 仍绑定 `main` commit、workflow bytes、package 与唯一 run，并在 15 分钟内 fail-closed 消费。

## 0.1.0-rc.9 - 2026-08-14

- Breaking：Buildr 的机器默认 CLI 现在只属于 npm installation，development checkout 不再创建、覆盖或要求 PATH 中的 `buildr` 指向源码；自举 workspace 统一显式使用 retained checkout 的 `projects/product/buildr`，并独立核对 Node、development channel、source commit 与 package version。
- Breaking：本机产品入口统一为 Buildr Web；CLI、Launcher、文档和自举激活不再把旧 Buildr Web/Buildr Web 身份当作当前产品表面。公开 npm 安装默认不产生桌面副作用，只有显式 Launcher 生命周期操作才创建、启动、修复或卸载图形入口。
- 将 Buildr Web 前端权威源码拆分到独立 `buildr-web` Service，并优化 Project/Service 目录与详情交互：支持文档展示、类型下拉、弹框编辑和更紧凑的目录页眉。
- 加固 Formal Task Finish：阻止陈旧 handoff 恢复，正确处理重命名贡献的包含性判定，支持受控零差异 Delivery Adaptation、可恢复 compact 输出、多个 Finish run 并存时的 owner-ordered 自举恢复预检，以及 retained provider 失败后的同 run bootstrap recovery。
- 扩展正式 Verification 执行记录：支持按 Task 回读并复用同一次终态执行、阻止相同目标和 capability 集合的重复启动，并恢复多任务数据库与 migration 的隔离边界。
- 将 `dev → main` 正式 Candidate 重构为同一 source SHA 与唯一 npm 候选制品上的 preflight、macOS core、三个 Windows shard、四个 Host Node tuple 和稳定 `Candidate gate` 聚合；`dev` push 不再重复触发完整 Candidate。
- 收敛 Buildr 自举激活：Finish 交付后由唯一 runner 使用 Environment retained Node 编排 retained sync、Buildr Web Dev、development entry identity 与最终 Doctor，不再让开发安装占用机器默认 npm CLI；安装前健康的 development 服务会在同一 loopback 端口以 successor checkout、全新 PID 与匹配 Node 恢复，保持自举更新和验证期间的服务连续性。
- 在 release tag 前增加 GitHub-hosted OIDC authority probe：由同一 `publish.yml` 和 `npm-production` Environment 对目标 npm package 完成 token exchange，并把不含凭证的 run、artifact、package、`main` commit 与 workflow digest 绑定为短时 current evidence；本机 npm 登录、OTP、`npm trust list` 不再参与发布前证明，任何漂移、过期或控制面不可读都 fail closed。
- 收紧 Rule 与 Skill 的权威边界，补齐 workspace-only Task Development handoff，压缩日常 Task Development 往返并规范 Parent Plan 临时输入清理，同时新增简洁的 Buildr 与 Agent 日常操作手册及双语公开上手路径。

## 0.1.0-rc.8 - 2026-08-12

- Breaking：把 Buildr 为 Agent Skill 投射保存的所有权回执迁移到 `.buildr/agent-runtime/<workspace|user>/<adapter>/skill-projection-ownership-receipts/`；实际 Agent Skills 路径不变。新版本会安全迁移仍能证明 runtime 文件的旧回执，新旧冲突或 runtime 漂移时零写入停止；旧 CLI 不再能自动管理已迁移投射。
- Breaking：清退 CLI Legacy 产品表面，删除 `openspec baseline create`、阶段型 `openspec check` 与 `skills migrate-project-assets` 的 route、实现和 JSON schema；连同已删除的 `sync-plan`/`sync-apply`，旧调用统一返回零写入 unknown-command。OpenSpec apply 改用 strict validation、current Planning Review 与单一 `converge`，legacy Project Skill source 只 fail closed，不再自动迁移。
- 收敛 Buildr CLI 产品表面：以单一 command catalog 统一 dispatch、canonical help、未知命令建议和 `primary`、`agent-machine`、`maintenance` 三层分类；补齐 `task finish` 聚合帮助。
- 修复候选验证的跨平台 npm 入口，并让 CI 在 Pull Request 与推送场景显式使用对应 Git 基线，保证 Windows 和 OpenSpec changed-path 审计可以执行。
- 修复 Windows 8.3 checkout 路径导致的 Environment Manager 误判，并隔离候选矩阵的 Node runtime 临时目录。
- 加固 Windows 受管 Node runtime 的离线 source copy、并发安装锁、短暂 `EPERM` 恢复和失败诊断；锁竞争测试使用平台无关的探测替身，不再把 POSIX shell fixture 当作 Windows `node.exe` 执行。
- 系统收敛跨平台候选验证：统一 Windows npm/OpenSpec shim、node:test 盘符路径、Git checkout 与用户目录边界；隔离 macOS Buildr Web loopback 连接复用，改用确定性资源容量证据，并在 CI 采用受限 workspace 并发。
- 明确 CLI 支持 Node.js `>=24.15.0 <25`：macOS 与 Windows 各运行一份固定受管 runtime 完整 Candidate，并以最低和当前 24.x 的短版 Host Node 作业验证版本敏感边界，删除重复的完整 Candidate 与独立 release smoke。
- 发布工作流只打包一次不可变 npm tarball，并让发布前 smoke、registry publish、CI artifact 与发布后 integrity 核验消费同一制品；已存在版本仅在官方 registry integrity 一致时安全复用。
- 扩展 Task 与 Buildr Web 的交付可观察性：保留正式验证执行记录、终态交付关联和复盘入口，支持 Parent/Child Task、嵌套筛选，并在 Environment 阻塞时仍可读取 Task 关联 Change。
- 收敛 Task Development、Environment 与 Finish 编排：稳定 Planning identity、Candidate 复用、语义化交付提交、隔离 Delivery Carrier 和自举同步边界，减少目标前进后的重复验证与恢复成本。

## 0.1.0-rc.7 - 2026-07-24

- 将本机工作台扩展为 Workspace、Project、Service 与 Change 的统一治理入口：支持稳定的目录、详情与编辑路径，展示真实 Git 状态和 OpenSpec 变更，并通过“交给 Agent”保持页面负责认知与交接、Agent 负责执行的边界。
- 提供全局多 Workspace 本机应用与完整安装体验：用户可登记、切换和移除本机 Workspace；macOS、Windows 提供可双击 launcher，修复 Finder 前台等待和 Windows 中文路径问题。
- 完善首次使用和日常导航：开始页展示真实工作范围与下一步，Project/Service 创建改为意图式 Agent Action，公开 README 与 Agent onboarding 说明两种开始路径。
- 加固 Agent 任务执行环境：实现前先路由 task worktree；支持多仓 task environment、隔离的 Buildr Web preview、任务收尾同端口迁移，并默认不推送远端任务分支。
- 收敛验证体验与证据边界：日常交付使用受影响验证，发布/高风险使用完整 Candidate；浏览器冒烟覆盖 Project、Service、Change 主流程，Candidate evidence 与实际 task environment identity 绑定。
- 将 Buildr 可执行实现迁入 `product/buildr` Service，并按 Domain、Application、Infrastructure、Interfaces 分层，保持 Product 治理资产与运行源码的责任边界清晰。

## 0.1.0-rc.6 - 2026-07-21

- Breaking：Skill source 只在 workspace `skills/` 治理；Project 改用 `capabilities.yml` 表达 requirements、bindings 与 applicability，`skills render` 显式选择 workspace 或 user destination，并以稳定 identity、projection receipts 和零写入冲突预检保护资产。
- 建立 Skill capability contracts 与 bindings，将任务分流、验证、Git 集成、worktree 生命周期、收尾和资产审查组合为可发现、可替换且 fail-closed 的 Agent 工作能力。
- 重构产品验证为 registry 驱动的 Changed、Focus 和 Candidate DAG，将完整候选证据绑定到 repository、Product root、tree/fingerprint 与 timing summary，并提供可安全清理的临时 evidence。
- 引入 Agent 维护的只读任务看板与独立任务资产审查，保留历史 `task-cockpit` 资产，并通过显式 builtin restore 安全迁移受管替换。
- 收紧 doctor、runtime 和公开 JSON 契约：区分 workspace valid、runtime readiness 与可操作诊断，将不可观测的 Agent Skill inventory 保留为 assurance metadata，并避免与 Agent 抢占通用理解、推理和任务执行职责。
- 重构 Commands 资产模型与 CLI 模块边界，加强 package、runtime adapter、managed mutation 和发布收敛检查，同时保持 Node.js 20+ 与七个 runtime adapter 的公开支持范围。

## 0.1.0-rc.5 - 2026-07-17

- 统一 Buildr 更新与 workspace 同步意图：Agent 能明确区分 CLI/Skill 更新和 `buildr sync`，并在 Git tree 变化后用 doctor 判断是否需要同步当前工作环境。
- 加固候选版发布流程：发布准备绑定 canonical worktree、最终候选 tree 和历史衔接门禁，GitHub Release 说明改为从对应 CHANGELOG 章节生成。
- 新增任务驾驶舱：复杂、长期或跨阶段任务可维护稳定的只读 HTML 全景，持续呈现目标、进度、结论、下一步和阻塞。
- 移除随包最小 workspace 示例，减少与公开文档重复的维护入口。
- 修正 `0.1.0-rc.4` 的发布范围，暂不发布任务资产审查能力。

## 0.1.0-rc.3 - 2026-07-15

- 强化 Agent 端到端工作引导：在 pull、rebase、checkout 和 worktree 切换等 Git tree 变化后先运行 doctor，再按诊断结果决定是否同步当前 Agent 工作环境。
- 重写中英文公开 README，以“让 Agent 越做越多，越做越好”直接表达产品价值，并明确从产品、开发到发布的端到端工作场景。
- 收敛发布 worktree 生命周期：远端已安全承载候选提交且无后续本地动作时，自动清理本地发布 worktree 和任务分支。

## 0.1.0-rc.2 - 2026-07-14

- 将 Buildr 的公开定位收敛为面向组织和 Agent 的工作资产治理系统，明确 Buildr 管理有组织的项目信息，而不是模型 context window。
- 新增 Cursor、Qoder、TRAE、TRAE Work 和 WorkBuddy runtime adapter，并用 trait catalog 统一 adapter 能力、检查与投射模型。
- 修复 Project scoped Rules render 可能清理无关 Project 投射的问题，并补充不同 cleanup 实现族的隔离回归。
- 将产品验证拆分为 fast、affected 和 candidate 三层入口；候选验证复用 npm tarball 并采用有界并行，显著缩短完整验证耗时。
- 增加 Buildr 候选版/稳定版发布 Skill，完善 GitHub trusted publishing、发布后 registry 与 GitHub Release 核验流程。

## 0.1.0-rc.1 - 2026-07-13

- 建立 Organization/Root、Project 和 Service 资产模型。
- 提供 Rules、Skills、Commands、Components、OpenSpec、doctor 和 source transaction 能力。
- 支持 Codex 与 Claude Code runtime projection。
- 支持从干净开发 checkout 或 npm tarball完成 Agent onboarding。
- 支持 Service 显式 branch intent 与远端 Skill 有界读取。
- 补齐 MIT License、公开 CLI reference、已知限制、贡献与安全说明及 GitHub Actions 验证。
- 固定官方源码为 `elevenching/Buildr`、npm identity 为 `@buildr-ai/buildr`，并提供中文/英文 README。
- 增加开源候选安全扫描、tag/version/dist-tag 契约和 OIDC-ready release workflow。
