# Buildr CLI Reference

本文说明 Buildr 0.1.x 的安装入口、公开命令与适用边界；文档版本不证明正式版已经发布。以 `buildr <topic> --help` / `buildr help <topic>`、`buildr runtime list --json` 和 `buildr doctor --agent <agent> --json` 的当前输出为最终参数事实。

安装包保留本文供离线查阅，入口失效时先看[安装与恢复](#入口不可用与恢复)。其他文档及源码链接需要仓库或网络，不承诺全部随包交付。

支持 `--json` 的命令在顶层输出 `schemaVersion`。该字段及兼容规则见 [公开 JSON 契约](../../../knowledge/docs/reference/json-contracts.md)；消费者应按 schema identity 判断格式，而不是依赖未声明的内部实现。

标准默认接入使用 `buildr.runtime-list/v2` 与 `buildr.doctor/v2`：前者区分文件适配器（Adapter）清单、品牌映射和宿主资料（Host Profile）；后者分别报告请求身份与实际文件约定，标准检查结果位于 `runtime.agentsStandard`，不再位于旧 `runtime.codex`。这是非加法的格式变更，旧消费者必须先识别版本并调整解析；不能把共享标准结果解释为 Codex 或任意宿主已安装、已加载。

根帮助从同一命令目录（Command Catalog）按三层显示：`primary` 是普通工作主路径，`agent-machine` 是 Agent/Skill 依赖的稳定机器接口，`maintenance` 是产品构建、开发预览和 workflow；已删除的命令不另设兼容分区。Surface 不是授权边界；每个 retained executable route 都可通过 canonical topic 查询帮助。

## CLI identity、帮助与错误

- `buildr --version`、`buildr -V` 和 `buildr version` 输出当前实际执行 package 的版本；`buildr version --json` 输出 `buildr.version/v1`。
- `buildr help <command...>` 与 `buildr <command...> --help` / `-h` 使用同一 canonical 帮助主题。
- 未知命令默认向 stderr 输出简洁错误、有限建议和 `buildr --help` 提示，并以 2 退出；携带 `--json` 时 stdout 只输出 `buildr.cli-error/v1`，stderr 为空。
- `-v` 不作为版本别名，为未来 verbose 语义保留；本 change 不提供 Shell completion。

## 首次使用

以下命令由智能体（Agent）执行，或供选择手动操作的人参考。先检查已有安装，并使用满足安装包 `engines.node` 要求的 Node.js；已有工作内容应保留，不重复初始化或擅自覆盖。

### 安装 Buildr

当前产品要求运行它的 Node.js 满足 `>=24.15.0 <25`；安装包不会自动下载替代版本。工作空间（Workspace）声明的受管 Node.js 只供该范围拥有的子进程使用，不能替代产品的安装要求。先检查 `node --version` 和 `npm --version`，再查询 npm 官方仓库：

```bash
npm view @buildr-ai/buildr dist-tags --json --registry https://registry.npmjs.org/
```

正式版轨道（Stable Track）对应 `latest`，候选版轨道（Candidate Track）对应 `next`。检查标签指向的实际版本：若 `latest` 仍带预发布标识，就不能报告已有正式版。按用户选择使用确切版本；已有选择和授权在相同范围继续适用，不自动切轨或降级。

将 `<version>` 替换为已查实的版本，再检查该版本的 Node.js 要求并安装：

```bash
npm view "@buildr-ai/buildr@<version>" version engines --json --registry https://registry.npmjs.org/
npm install --global "@buildr-ai/buildr@<version>" --registry https://registry.npmjs.org/
buildr --version
buildr installation status --json
```

安装包包含命令行工具（CLI）与 Buildr Web。用户明确需要 macOS 或 Windows 的本机图形入口时，再安装 Buildr Web 启动器（Launcher），将其绑定到同一 npm 安装：

```bash
buildr web launcher install
```

其他平台通过下文的 `buildr web --target "<dir>"` 打开 Buildr Web。

全局安装与启动器（Launcher）不会向尚未确认的工作空间（Workspace）写入内容，也不会安装智能体（Agent）的技能（Skill）；这些在确认目录并初始化时完成。

### 确认目录并初始化

安装后核对用户已经明确的目标目录；目标有歧义时才询问。用户也可以在智能体（Agent）工具中打开目录后要求初始化。核对当前智能体（Agent）的身份与支持情况：

```bash
buildr runtime list --json
```

将下面的占位内容替换为已确认的值；`<agent>` 使用当前工具对应的标识，`<profile>` 选择 `personal`、`team` 或 `company`，`<dir>` 是工作空间（Workspace）根目录：

```bash
buildr init --agent "<agent>" --target "<dir>" --name "<name>" --description "<description>" --profile "<profile>"
```

`init` 默认先初始化源资产，再复用完整 `sync`，安装或更新 Buildr 技能（Skill）、投射当前工作空间（Workspace）的内容并给出最终诊断。已知身份使用 `--agent`；未知身份可省略，保留唯一既有接入方式，没有既有方式时采用 `agents-standard`。多个不等价方式要求明确选择。仅需源资产时使用 `buildr init --source-only --target "<dir>"`；`--source-only` 与 `--agent`、`--adapter` 互斥。

`--adapter <adapter-id>` 显式选择文件约定，不替换真实品牌身份；未知适配器（Adapter）、非法品牌或互斥参数都在写入前失败。已选实现失败时保留错误，不切换其他实现，也不以纯源资产结果冒充完整初始化。根据最终结果继续项目（Project）、服务（Service）和第一项工作。`init` 与 `sync` 不隐式安装用户级技能（Skill），文件准备成功也不证明当前会话已加载。

### 打开 Buildr Web

打开已初始化的工作空间（Workspace）：

```bash
buildr web --target "<dir>"
```

启动器（Launcher）的状态检查、修复或卸载使用 `buildr web launcher status|repair|uninstall`。

工具支持情况与使用注意事项见[运行时适配参考](agent-runtime-adapters.md)。

### 后续维护

已有安装与工作空间（Workspace）的更新，按当前 Buildr 技能（Skill）处理。更新产品与更新工作空间（Workspace）是不同动作，不能以其中一项代替另一项；不要自行切换已选版本轨道或降级。

标准技能（Skill）目标采用一级 `.agents/skills/<skill-id>/SKILL.md`，保留源目录及随附文件的相对路径。所有权回执（Ownership Receipt）属于 `.buildr/agent-runtime/<workspace|user>/<ownership-id>/skill-projection-ownership-receipts/` 本机控制状态；标准共享根（包括 Cursor/TRAE 技能）统一归属 `agents-standard`，专用规则（Rule）保持独立。旧品牌或旧运行时根内回执（Receipt）及嵌套受管目录仅在身份、完整内容、权限和目标安全均可证明时迁移；冲突、漂移、额外未知文件时整组零写入。迁移后不要用旧版 Buildr 继续管理；回退需要完整的操作前文件与回执（Receipt）备份。

`buildr update` 只更新安装回执（Installation Receipt）证明的当前 npm 安装或开发检出（Development Checkout）：前者更新同一安装位置中的软件包，后者按 Git 状态更新源码；来源不明时停止。它不接收 `--target`，不负责同步工作空间（Workspace）。

用户要求“更新工作空间”或“同步工作空间”时，智能体（Agent）先判断根目录是否由 Git 管理：受 Git 管理时，按 `buildr.git-operations/v1` 能力绑定（Capability Binding）选择提供者（Provider），明确目标目录、上游和更新动作，成功后执行 `buildr sync <agent> --target <workspace>`；不受 Git 管理时直接同步。所需提供者（Provider）不可用，或遇到本地改动、分叉、冲突等需要决定的情况时，停止相关更新与同步并保留现场，不自动执行 `stash`、`reset`、`rebase`、`merge` 或覆盖文件。Git 更新成功后不重复询问同步。

`buildr sync` 同步当前本地工作空间（Workspace）的产品源能力，安装产品入口技能（Skill），投射当前智能体运行时（Agent Runtime）并执行最终诊断（Doctor）；它不隐式更新 Git 或 Buildr 产品安装。

### 入口不可用与恢复

命令帮助可离线使用，不依赖工作空间（Workspace）已经初始化。`buildr help init`、`buildr help skill install`、`buildr help sync` 和 `buildr help mutation recover` 分别说明当前参数；首次安装仍以前文 npm 入口为准，联网失败时不要猜测版本。

| 当前问题 | 恢复依据与完成条件 |
|---|---|
| 命令无法启动 | 核对实际 Node.js 与安装包 `engines.node`；按前文安装入口修复。能输出 `buildr --version` 和 `installation status --json` 后再处理工作目录。 |
| 产品入口技能（Skill）缺失或未发现 | 先确认宿主身份和 `runtime list --json` 支持情况，再运行 `buildr skill install <agent> --target <dir>`；按该工具要求刷新或开始新会话。投射成功不等于当前对话已加载。 |
| 初始化中断，或工作空间（Workspace）投射过期 | 保留已经初始化的源资产；按诊断修复具体问题后运行 `buildr sync <agent> --target <dir>`，消费其最终诊断（Doctor），不重复初始化。 |
| 源资产写入事务中断 | 读取诊断给出的事务标识和当前 `mutation recover` 帮助，只对有完整日志及备份的确切事务恢复；不手工删除锁或猜测半完成状态。 |
| 启动器（Launcher）无法打开网页 | 用 `buildr installation status --json` 和 `buildr web launcher status` 核对绑定；按诊断选择 `repair`，不把网页未刷新误判为安装包未更新。 |

需要独立诊断时明确传入 `buildr doctor --agent <agent> --target <dir> --json`；`init --agent` 或 `sync` 已返回同一现场的最终诊断（Doctor）时直接复用。未确认宿主时只暂停依赖该运行时（Runtime）的动作，不借用其他适配器（Adapter），也不扩大为所有工作都不能继续。

## 工作空间（Workspace）与资产

当前全局模型分别登记项目（Project）、服务（Service）和代码库实例（Repository Instance）。项目（Project）通过 `serviceIds` 引用服务（Service），服务（Service）通过 `repositoryId` 引用一个实例；实例保存实际代码位置和 Git 来源，可承载多个服务（Service）。目录嵌套不决定业务归属，写入登记也不代表代码已准备。

```bash
buildr assets inspect --target "<workspace>" --json
buildr help assets
```

`inspect` 返回当前对象、引用、`revision` 和 `migrationRequired`。当前初始化仍可能返回需要迁移的清单；`migrationRequired: true` 时，核对返回的对象与重名问题，准备 `{"revision":"<刚读取的 revision>"}`，通过 `buildr assets migrate --target "<workspace>" --input "<json-file>" --json` 显式迁移，再使用返回的新版本。旧服务（Service）重名时还需提供明确的 `codeMappings`；迁移不搬动代码，不按相同地址合并不同代码库实例（Repository Instance）。

`buildr help assets` 与 `buildr assets --help` 提供当前动作的输入字段、目录观察要求和最小示例，可离线读取。写入使用 `--input <json-file>`，提交刚读取的版本和明确选择；版本冲突后重新读取并核对，不盲目重复写入。

项目（Project）关联必须提交完整的 `serviceIds`，解除关联保留服务（Service）和代码。已有目录先读取相应的 `*-candidates`，再提交候选的观察值；目录变化时重新核对。登记只保存身份与来源，不执行克隆、拉取、切换分支或搬迁。`assets remove` 和兼容的 `assets delete` 都只取消登记；代码库仍被服务（Service）引用时拒绝移除。

| 命令 | 用途 |
|---|---|
| `buildr init [--agent <agent>] [--adapter <adapter-id>]` | 默认初始化源资产并完整同步标准或已选文件约定，安装产品入口技能（Skill）、投射并执行最终诊断（Doctor）。仅源资产使用互斥的 `--source-only`。 |
| `buildr web [--target <workspace>] [--no-open]` | 启动或复用只监听 `127.0.0.1` 的默认本机 Web 应用；默认打开浏览器，登记和切换多个 Workspace，`--target` 登记并打开指定 Workspace。 |
| `buildr web preview start\|list\|stop` | 启动、查看或停止隔离的开发预览。带 `--task <task-id> --target <canonical-workspace>` 时，Preview使用matching Task Worktree并保存精确owner；停止时复核Worktree evidence与进程secret。不带Task时保持独立checkout preview。 |
| `buildr installation status [--json]` | 分别报告receipt证明的npm CLI、Buildr Web Launcher、Buildr Web Dev、当前安装与当前Web实例的版本、路径、runtime role、protocol、payload和ownership identity；不扫描PATH。 |
| `buildr web launcher install/status/repair/uninstall` | 从verified formal npm安装显式创建、诊断、修复或卸载本机Buildr Web Launcher；wrapper只执行binding中的Host Node和同一package entry。Development checkout使用隔离的Buildr Web Dev入口。 |
| `buildr project create <code>` | 创建或登记 Project；`--name`/`--description` 设置 metadata，`--repo`、`--remote`、`--integration-branch` 声明独立 Git source，并补齐空 `commands.yml` requirement context。 |
| `buildr project daily-progress record\|inspect\|list --project <code>` | Agent-machine 本机每日演进。`record` 把已构造的四问摘要、提交与变更文件写入 `.buildr/daily-progress/<project-code>/<YYYY-MM-DD>.yml`；Task 关联可选，他人提交禁止挂 Task，存在的 Task ID 仍须本机已有。`inspect`/`list` 只读。JSON 使用 `buildr.project-daily-progress-*-result/v1`。不进入 Git 或 Task SQLite，读取路径不扫描 Git，也不提供定时调度。 |
| `buildr assets create service --input <json-file>` | 当前全局服务（Service）登记入口，输入包含当前 `revision` 和明确的服务（Service）、目录及代码库选择；通过 `assets associate` 维护项目（Project）引用。 |
| `buildr service create <project>/<service> <repo-ref>` | 仅保留给未迁移的旧工作空间（Workspace）。存在全局 `services/manifest.yml` 时会要求使用 `assets create service`，不能作为新用户接入入口。 |
| `buildr worktree create\|inspect\|cleanup <task-id>` | 窄Git worktree provider。`create`接受branch/start point与显式Project/Service selectors；`inspect`复核checkout/branch/HEAD/clean/registration；`cleanup`要求每仓成对提供expected source与delivered完整提交。它不判断Task完成，也不准备Runtime、CLI、依赖、projection或动态资源。 |
| `buildr project verification inspect\|validate\|update` | 读取、校验或按expected identity更新Project测试地图。候选由Agent从真实测试、构建脚本、CI和说明形成，Application不生成内容。 |
| `buildr task verification record\|inspect` | 保存或读取开发完成后的Task验证报告。Agent直接调用项目测试工具；Buildr不生成计划或代跑测试。 |
| `buildr task create\|inspect\|update\|activate\|complete\|abandon` | 在canonical Workspace的SQLite中维护Task Record v3。除`create`外的写动作都必须提交刚观察到的`--expected-record <digest>`。完成只保存真实结果摘要，不保存`noChange`、Git、验证、环境或发布事实。终态Task可通过`update`登记固定本机复盘文档或显式更正业务事实。 |
| `buildr task commits <task-id> [--target <canonical-workspace>] [--json]` | 只读查询任务范围内带有有效 `Buildr-Task` 尾注（Trailer）的当前可达 Git 提交（Commit），包含本机未推送提交。返回真实完整说明、哈希值（Hash）、来源、读取范围和局部诊断；不抓取远端，不写任务或 Git。 |
| `buildr task work-context inspect\|record\|respond <task-id>` | 独立工作摘要与显式待处理事项。`record` 使用 `--expected-current <absent\|digest>`、`--progress`、`--next-step`；可明确登记或清除事项。`respond` 以当前版本、事项身份和真实用户意见保存答复，不改变任务状态或完成结果。 |
| `buildr task parent inspect` | 只读查看整体目标、真实子任务及结果、完成观察身份和历史父计划。旧 record、reconcile、bind-child、refresh-planning、reconcile-child-delivery、accept 写入口已退役。父任务通过已有 task complete 提交当前版本、验收和明确用户授权。 |
| `buildr task verification inspect\|record <task-id>` | 读取或整值保存Workspace SQLite中的current任务验证报告。`record --report <json-file>`接收Agent在开发完成后形成的实际检查、选择范围、目标、结果、未覆盖项和结论；`inspect`可带当前内容identity判断报告是否仍适用。命令不生成计划、不执行测试、不绑定Candidate。 |
| `buildr rules add/remove` | 维护 root Rules manifest 和文件生命周期。 |
| `buildr skills add/remove` | 只维护 workspace `skills/` 中的 Skill source；旧 `--scope .` 仅兼容并警告，Project scope 被拒绝。 |
| `buildr skills bind/unbind` | 维护 workspace 默认 binding，或在 `projects/<project>/capabilities.yml` 维护 Project context binding。 |
| `buildr skills render [<agent>] [--adapter <adapter-id>] --destination workspace\|user` | 从 `--target <workspace>` 读取源资产，投射到工作空间（Workspace）或个人用户层；默认 workspace，不按品牌登记限制通用技能（Skill）。 |
| `buildr commands add/remove` | 维护 workspace Command catalog definitions；最后一个 definition 仍被 requirement 引用时零写入。 |
| `buildr commands check [--project <project> ...]` | 按显式 Project task context 合并 requirements 并观察本机环境；无 Project 时只检查 workspace defaults。 |
| `buildr component list/check/install/uninstall` | 管理 workspace 级 Rules、Skills、Command collections 与声明式 Skill Contribution。 |
| `buildr builtin list/uninstall/restore` | 查看或维护 Buildr 内置能力；required 能力不能卸载。`restore` 表示明确放弃该 Builtin 的本地修改；replacement 只接管可证明为 Buildr-managed 的 predecessor，恢复 source 后再运行 `sync <agent>` 收敛 runtime。 |
| `buildr update [check]` | 按安装回执（Installation Receipt）检查或更新当前 npm 安装或开发检出（Development Checkout）；不负责工作空间（Workspace）同步。 |

新 Workspace 使用 `.buildr/workspace.yml` 的 `buildr.workspace/v1` schema，并与 `skills/manifest.yml.workspaceId` 共享同一 UUID。旧 metadata 可以在 `buildr web` 中只读查看；`buildr sync <agent>` 通过同一 source transaction 显式迁移两份 Manifest，identity 冲突时零写入失败。页面修改使用 revision compare-and-swap，不自动覆盖 Agent、Git 或编辑器已经产生的外部变化。

Task Record 使用closed `buildr.task-record/v3` schema。顶层状态为`todo|active|completed|abandoned`，查询态`open`派生为todo + active。可选`retrospective`只保存本机Markdown的SHA-256与`pending-decision|decided`；不保存正文、处置说明或后续Task关系。只保存Child的`parentTaskId`，反向Children由查询派生；`isParent`保存明确父任务身份。所有非创建写动作都比较当前`recordDigest`。

`task commits` 先确认任务存在，再读取其项目、服务、关联变更对应项目与已知任务工作树（Worktree）中的真实代码库（Repository）；不会扫描任意目录。没有项目、服务或关联变更的工作空间级任务（Workspace-only Task），只检查任务所属主工作空间（Canonical Workspace）根目录本身的 Git 代码库，不向父目录寻找替代来源。关联依据是实际提交说明（Commit Message）末尾的 `Buildr-Task: <taskId>`，正文普通提及不算关联。查询按真实代码库和完整哈希值（Hash）去重，读取本机当前可达引用；JSON 使用 `buildr.task-commits/v1`，必须结合 `status`、`coverage` 与 `diagnostics` 判断结果完整性。部分结果不能表述为确定的零提交，读取成功也不代表任务完成。旧提交不自动补尾注或改写历史。

工作台（Workbench）默认展示工作概览，并提供任务（Task）与动态入口；文章位于工作空间（Workspace）区域。最近进展、下一步和显式待处理事项由独立工作摘要维护，人的答复按事项身份和已观察版本保护。置顶、接下来、关注、收藏和最近访问是本机偏好，与任务四态独立；查看概览不扫描 Git 或自动生成每日演进。旧任务深链继续可用。

Task Record、Task Verification与Planning/Completion Review以`.buildr/local/workspace.sqlite`作为单机持久化authority。复盘正文保存在被Git忽略的`.buildr/local/task-retrospectives/`，SQLite只保留Task上的文档摘要和决定状态。旧复盘current/source表、研发、旧收尾和统一Task Environment current表已删除，不建立history或双读。

默认 App 的用户级登记文件只保存规范化 Workspace root 和最近使用项；Workspace 名称、说明、Project、Service 与全局 Change 列表始终从 retained Workspace 实时读取。任务（Task）详情按“任务需求、方案设计、开发实现、任务收尾”组织内容，读取工作摘要（Work Context）、关联 OpenSpec 材料、原型、审查（Review）与验证（Verification），并展示完成摘要和本机复盘入口。“任务收尾”后的“提交记录”是独立阅读标签，不增加工作阶段，与命令使用同一只读应用。页面不启动专业执行，也不重新建立旧研发或机器交付状态库。

Project registry 使用 `buildr.projects/v2`：每个 Project 保存 UUID `id`、所属 `workspaceId`、可读 `code`、`name`、`description` 和 `source`。`source.path` 是文件系统物化位置；Git source 另外保存 URL、remote 和稳定的 `integrationBranch`。`currentBranch`、HEAD、dirty、upstream 与 ahead/behind 是实时观察状态，不写入 Domain。v1 registry 可只读查询，`buildr sync <agent>` 显式迁移；页面不会静默迁移、切分支、stash 或改写 remote。

当前服务（Service）保存 `id`、`workspaceId`、`code`、`name`、`description`、`type`、`repositoryId` 和 `modulePath`；代码来源由独立代码库实例（Repository Instance）保存，项目（Project）引用不建立唯一父级。旧 `service create --integration-branch` 仅作用于旧模型的 Git 来源，`--branch` 是兼容别名。当前分支、HEAD、未提交内容及上游差异由实际 Git 状态观察，不写回稳定来源声明。

Project根可选`preparation.yml`，长期说明Project-wide或Service-scoped真实准备入口。Agent只在当前动作需要时，从matching Project或Service根直接调用对应wrapper；没有额外准备的Project无需声明空步骤。Buildr不生成Task Plan、不保存选择和执行结果，也不把局部准备失败扩大为统一工作许可。

旧 `project create`、`service create` 的后续提示和相关 Buildr Web 交接会指向 `declaration-intake`；准备入口缺口与验证（Verification）覆盖缺口也使用该入口。它只读检查 `preparation.yml` 与 `verification.yml` 的候选或差异，登记事务及读取动作不写声明。已确认入口在既有授权内的普通维护交给声明所有者；新增范围、能力、外部效果或长期边界变化才请求相应决定。`task-verification` 继续负责测试地图维护。

Git provider evidence使用`buildr.git-worktree-evidence/v1`，保存在Git common-dir的`buildr/task-worktrees/<task-id>.json`。它只包含repository selector、source/checkout、branch/start point、HEAD、clean、registration、remote和Git effects。成果交付后，Agent把已核对的逐仓source与delivered完整提交直接交给provider；provider复核source版本、dirty、registration和retained ref后才删除。provider不删除远端分支，也不执行交付或验证判断。

## Runtime 与诊断

| 命令 | 用途 |
|---|---|
| `buildr runtime list` | 查看标准默认值、静态适配器（Adapter）、已知品牌映射、文件能力及证据边界。 |
| `buildr doctor [--agent <agent>] [--adapter <adapter-id>]` | 只读检查资产、当前产品安装、所选或已有受管运行时（Runtime）文件及已声明外部命令（Command），报告问题与修复建议。 |
| `buildr render [<agent>] [--adapter <adapter-id>]` | 组合投射规则（Rule）与工作空间（Workspace）技能（Skill），不安装产品入口技能（Skill）。 |
| `buildr sync [<agent>] [--adapter <adapter-id>]` | 同步本地产品源能力，安装产品入口技能（Skill）、投射并执行最终诊断（Doctor）。 |
| `buildr runtime check [<agent>] [--adapter <adapter-id>]` | 专项比较所选文件约定在目标作用域的期望状态。 |
| `buildr skill install [<agent>] [--adapter <adapter-id>]` | 只安装产品入口 Buildr 技能（Skill）。 |
| `buildr mutation recover <id>` | 从完整 transaction journal/backup 恢复未完成 source mutation。 |

`doctor` 的 `ok` 为兼容字段，只表示没有 error，不表示 workspace 已无需处理。Agent 应同时读取 `health.workspaceValid`、`health.ready`、`health.actionRequired` 和 `repairPlan`：例如只有 actionable warning 时，结果可以是 `ok: true` 但 `ready: false`。canonical workspace identity 要求根 `AGENTS.md`、`.buildr/workspace.yml` 和 `projects/` 同时存在；只存在其中一部分时报告 `incomplete`，不会误判为已初始化。

默认 doctor 分三层声明诊断边界：`core` 每次检查 workspace identity、mutation recovery 和 root registries；`conditional` 只在相关 scope、资产或 selected Agent 适用时检查 Project/Service、Rules/Skills、package assets、Commands 与 runtime；`specialty` 是显式场景。对已声明的独立 Git Project，doctor 会比较 remote、`integrationBranch` 和本地实时状态，但不会执行 Git 修改；它不深检 OpenSpec active change，也不运行 build/test。需要更多细节时进入对应 Git、OpenSpec、验证工作流。

`codex`、`dsh` 及未登记的有效品牌选择 `agents-standard`，`claude-code`、`cursor`、`qoder`、`trae`、`trae-work`、`workbuddy` 保留专用文件约定。`--adapter` 是严格选择，错误不回退；品牌标识区分大小写，只允许字母、数字、点、下划线和连字符。省略选择时优先保留唯一既有受管方式；多个不等价方式只读可列出，写入前需明确选择。无既有方式则默认标准，不伪造品牌。

诊断分别表达请求 `runtimeId`、实际 `adapterId`、选择原因、文件状态和安装/加载证据；`supported` 只表示可准备所选文件，不能解释为品牌已经安装或会话已经加载。未传身份的诊断只检查已有受管方式（无既有方式时检查标准），不会为所有未安装专用适配器（Adapter）制造缺失噪声。具体路径、刷新方式和证据边界见[运行时适配参考](agent-runtime-adapters.md)。

通用技能（Skill）省略 `runtimes`；明确列表继续按请求品牌限制适用性，不因共享标准而扩权。历史产品拥有的完整品牌列表可升级为通用，用户缩小的列表、绑定和卸载状态保留。共享根中仍有启用来源的技能（Skill）不会因本次品牌未选择而被清理；品牌差异导致相同技能（Skill）的正文或绑定不一致时报告冲突，不后写覆盖。

## Commands 三层模型

- workspace `commands/manifest.yml` 与 `commands/**/manifest.yml` 是唯一 catalog definition source，保存 `id`、`executable`、version probe 和最小 `installHint`。
- `projects/<project>/commands.yml` 使用 `buildr.project-commands/v1`，只保存 `id`、required/optional、可选版本约束和用途；它不复制 definition。
- `commands check` 的 `catalog`、`requirements`、`effectiveConstraints`、`observations` 和 `findings` 分别表达源定义、业务要求、合并结果、本机观察和诊断。重复 `--project` 表达跨 Project task context；不兼容版本约束在 probe 前以 `command_requirement_conflict` 失败。

Buildr 不 render 或安装 Commands，不保存 binary、token、cookie、登录态、license 或个人配置。machine warning 只说明当前环境与有效 requirement 的差异；安装、升级或登录仍需要用户单独授权。

## Project 测试能力声明

`projects/<project>/verification.yml` 只接受closed `buildr.project-verification/v4`测试地图。每项testing family声明稳定id、Project/Service scope、purpose、sourcePaths、testRoots、完整command或Agent入口、选择指导与requirements，不列举具体测试文件，也不保存一次性计划或运行结果。

Task Verification Skill指导Agent在开发中直接调用Maven、npm、Playwright、Browser、HTTP或Project自有runner；开发完成后扩大到任务相关功能测试和受影响Service完整低成本回归，并将有意义报告通过Application保存。测试失败先修复或如实报告，不生成统一流程状态。

没有声明或没有适用能力时，doctor 不产生 finding，Task Verification 在具体 Result 中报告 coverage gap，不自动开发测试。文件存在时 doctor 只做 closed schema、路径、scope 与资源引用校验，不运行命令或探测测试环境。用户通过 Agent 说“初始化测试声明”或“更新测试声明”时，Agent 只从真实 build scripts、CI、文档和已有测试发现候选，并由用户确认 Project policy。

current Task报告使用`buildr.task-verification-report/v1`，绑定Task scope、Agent提交的实际内容版本和current Project测试地图identity，保存实际checks、选择范围、targets、结果、gaps与结论。Task Verification Application只提供`record|inspect`并整体替换current报告；`inspect`按调用方内容identity与current测试地图派生`current|stale|unknown`。它不创建Execution Record，不保存stdout/stderr或临时路径，也不决定Task完成或交付。

## Skill capability contracts

`buildr.skills/v3` 为每个 workspace Skill 保存稳定 `assetIdentity`/`sourceIdentity`，并支持 versioned contract、provider `provides`、consumer `requires` 和 workspace 默认 binding。Project context 使用 `buildr.project-capabilities/v1`。安装 provider 本身不会静默改绑。

Contract 格式、scope 规则、替换示例以及 `ready` 的边界见 [Skill Capability Contracts](skill-capability-contracts.md)。

## Product maintenance / workflow internal

- `buildr package check/build`：产品 package 维护和构建，不是普通 workspace 日常命令。
- `buildr openspec converge <change> --project <project> --target <actual-work-root> --json`：Buildr OpenSpec单一收敛事务；target是Agent已确认的当前Workspace或matching Worktree。内部检查相关变更冲突，使用锁定 OpenSpec 1.13.0 完成规范写入与归档，并保留必要的文件观察与中断恢复；仅恢复时已确认规范全部写入才使用`archive --skip-specs`，结果为`passed|blocked|recovery-unprovable`。
- `buildr openspec convergence inspect <change> --project <project> --target <workspace> --json`：只读检查仍存在的未决事务Receipt及before/expected/actual；active Change未开始或Change已归档时返回`not-applicable`。它不写canonical、Receipt或archive，也不用于环境清理后的长期审计。
- `openspec audit`、`openspec baseline create`、阶段型`openspec check`、`openspec sync-plan`与`openspec sync-apply`均已删除；旧调用返回标准unknown-command。
- `openspec baseline create`、阶段型 `openspec check`、`openspec sync-plan` 与 `openspec sync-apply` 均已删除；旧调用返回标准 unknown-command 且不会读取或写入旧 sidecar。标准规范解析、重建和正常写入由锁定上游负责，Buildr 不另行实现同一算法。
- `skills migrate-project-assets` 已删除。legacy Project Skill source 继续 fail closed，当前 Buildr 不复制、合并、改写或删除其 bytes；升级前需使用旧版本完成迁移，或人工审阅后整理到 workspace `skills/`。

这些命令可执行，但不构成普通用户需要记忆的 public asset API。

## 内部实现边界

`bin/buildr.mjs` 是稳定的 npm 命令入口。正式安装包包含打包后的 `runtime/buildr.cjs` 与 `payload/`，不依赖开发目录中的完整 `src/` 模块树；具体内容由[发布打包实现](../tools/release/release-artifact.ts)确定。内部文件不是公开 JavaScript 接口（API），不承诺文件级导入兼容；维护约定见[命令架构](cli-architecture.md)。

## 远端 Skill 请求

resolved `skill-url` 默认具有有限请求时间。维护者可设置：

- `BUILDR_REMOTE_SKILL_INACTIVITY_TIMEOUT_MS`
- `BUILDR_REMOTE_SKILL_TOTAL_TIMEOUT_MS`

值必须是 `1..120000` 的整数毫秒。生产环境建议为 resolved source 提供 `sha256-<hex>` integrity。

父任务使用 `task create --parent-task` 或 `task update --parent-task` 明确标记；`--parent <id>` 表示子任务归属。完成父任务时提供 `--expected-record <recordDigest>` 与 `--parent-completion <json-file>`，输入格式由随包 `task-manager` 说明。子任务完成不自动完成父任务。
