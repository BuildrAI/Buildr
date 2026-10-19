## Context

动机与授权范围见 [proposal.md](proposal.md)。当前命令入口 `services/buildr/src/modules/workspace/interfaces/cli/workspace.ts` 调用 `initializeWorkspace`；后者在源资产准备完成后通知输出层，再调用 `syncRuntime`，未登记本机工作空间（Workspace）。因此，仅启动不带目标目录的 Buildr Web 时，不能从初始化结果直接发现新目录。

已有 `ensureRegisteredTarget` 会读取当前列表，未登记时调用 `registerLocalWorkspace`，已登记时直接返回现有身份。登记应用统一通过 `workspace-registry-repository.ts` 保存当前网页配置范围（Web Profile）的 `workspace-registry.json`，并核对工作空间（Workspace）身份、网页管理归属、文件锁（File Lock）和比较后交换（Compare-and-Swap，CAS）版本。发布版与开发版的数据目录和管理身份继续由既有安装契约决定。

现有 `human-agent-onboarding` 规范已要求 `--source-only` 只初始化源资产、非法参数在写入前失败、后续同步失败保留源资产。本变更只增加默认登记及其阶段结果，不修改这些约束。

## Goals / Non-Goals

**Goals:**

- 使普通初始化准备出的目录立即出现在同一产品的本机列表中，用户打开 Buildr Web 后能够配置项目（Project）、服务（Service）与代码库（Repository）。
- 复用同一登记应用和本机存储，明确源资产、本机登记与运行时（Runtime）准备的先后及失败结果。
- 保留纯源资产模式、重复初始化和当前管理归属的兼容边界。

**Non-Goals:**

- 不启动或修改 Buildr Web、启动器（Launcher）及前端界面，不新增登记存储、公共协议或安装模式。
- 不自动迁移、批量补登记已有目录，不转移发布版与开发版之间的管理归属，不删除已有登记。
- 不改变项目（Project）、服务（Service）、代码库（Repository）的创建规则，不在初始化中代替用户完成业务配置。

## Decisions

### 1. 在初始化应用中复用已有登记端口

在 `initializeWorkspace` 的源资产准备完成阶段，使用已组合的 `ensureRegisteredTarget`，并为初始化运行时（Runtime）依赖明确声明该端口。普通命令入口与应用调用共享行为；不在命令输出回调中附加登记，也不直接写入本机文件。现有端口已有幂等与归属保护，避免复制业务判断。

替代方案是在启动网页时附带 `--target`；这只能修补某个打开路径，初始化本身仍缺少登记。另一方案是让初始化直接追加 JSON；它会绕开身份、归属和并发保护，因此不采用。

### 2. 源资产成立后登记，再执行同步和最终诊断

保持现有参数预检和源资产准备顺序，随后普通路径登记当前目录，再进入已有 `syncRuntime`。`--source-only` 跳过登记和运行时（Runtime）准备。登记完成不等于网页已经打开，也不等于当前智能体（Agent）已经加载文件。

登记放在同步前，使后续运行时（Runtime）失败时仍可在本机列表找到已经存在的工作空间（Workspace）。不把登记移到全部同步成功之后，也不因后续失败撤销已成立的登记。

### 3. 失败按阶段报告，保留已经成立的事实

登记失败时，初始化返回失败，明确说明源资产已初始化、本机登记未完成和既有应用提供的具体原因；不继续输出整体成功，也不为恢复改写身份或转移渠道。后续同步或最终诊断失败时，保留现有恢复指引，并明确本机登记已经成立，避免用户再次初始化或手动添加。

此处理复用现有异常与命令结果，不建立另一套初始化状态库。重复初始化使用实际已保存的身份，已有登记直接复用，不因本次传入的名称或新生成的临时标识改写原身份。

### 4. 知识维护只校准受影响的开始路径

更新 `services/buildr/docs/cli-reference.md` 的初始化、副作用和失败说明，`knowledge/docs/guides/getting-started.md` 的安装后登记及网页配置顺序，以及随包 Buildr 技能（Skill）源 `services/buildr/resources/runtime/skills/buildr/SKILL.md` 和其适用的 `references/asset-maintenance.md` 指引。

根目录的 `README.md`、`README.en.md` 由当前任务已授权的文档阶段同步维护：首次复制指令只覆盖安装、初始化与打开；之后在 Buildr Web 配置工作范围。这里只协调事实，不重复引入命令手册。现有模块职责、技术关系和长期术语未改变，无需新增或重画技术图（Technical Diagram）、代码地图（Code Map），也不新建辅助知识状态记录。

## Risks / Trade-offs

- [普通初始化新增本机持久写入] → 仅使用当前产品的配置范围（Profile），由 `--source-only` 保留无本机登记的显式路径，帮助和使用说明准确列出副作用。
- [源资产成立后，登记或同步仍可能失败] → 分阶段输出真实结果，保留源资产和已成立登记，恢复仅处理失败阶段。
- [本机登记损坏、归属冲突或并发修改] → 保留已有应用、文件锁（File Lock）及比较后交换（Compare-and-Swap，CAS）保护，不覆盖另一方内容，不在初始化中自动迁移或删除。
- [重复初始化已有身份或复制目录] → 复用已保存身份与登记检查；同一目录保持幂等，不以替换标识解决重复身份冲突。
- [初始化检查污染真实本机列表] → 所有执行检查通过既有隔离执行器，使用独占 `BUILDR_APP_DATA_DIR`、`BUILDR_PRODUCT_DATA_DIR` 与工作目录；不运行指向真实用户状态的初始化。

## Migration Plan

新行为随普通产品更新生效，不迁移存量列表。后续普通 `init` 可为符合既有登记条件、尚未登记的目标目录补齐当前本机条目。纯源资产模式保持原行为。

撤回代码不会自动移除已经成立的本机登记；该登记仍是合法当前事实，按既有明确移除入口处理，不以代码回退为删除授权。无需数据格式迁移。
