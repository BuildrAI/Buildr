# Buildr 本机数据与恢复边界

[返回数据全景](buildr-data-design.md) · [数据库表设计](buildr-database-tables.md)

这篇说明 SQLite 之外的本机数据：它们属于谁、为什么存在、丢失会怎样。**“本机数据”是保存范围，不是删除许可。** 记录进程的文件可能短期有效，但记录所有权或恢复前镜像的文件，在相关操作结束前不可缺少。

本文依据产品当前路径解析、写入和恢复实现，不读取真实用户的安装记录、凭证或任务正文，不提供一键清理清单。下列位置是代码定义的模板；不能只按目录名推断某份实际文件仍归当前操作所有。

## 一、先找到正确的数据范围

| 范围 | 如何确定 | 放什么 |
| --- | --- | --- |
| 工作空间（Workspace）根 `W` | 明确选择的真实工作目录 | 身份与长期资产，以及 `.buildr/` 下的本机协作和管理数据 |
| 项目（Project）根 `J` | 项目（Project）的 `source`，不只按目录名拼接 | 项目（Project）治理材料、OpenSpec、知识和声明 |
| 用户主目录 `H` | 当前操作系统用户 | 用户级智能体运行时（Agent Runtime）入口及其投射回执（Receipt） |
| 产品数据根 `P` | 产品路径解析；可由 `BUILDR_PRODUCT_DATA_DIR` 覆盖 | 产品安装登记等跨工作空间（Workspace）的本机信息 |
| 应用数据根 `A` | 当前应用身份与运行配置（Profile）；可由 `BUILDR_APP_DATA_DIR` 覆盖 | 应用实例、登记过的工作目录等 |
| Git 共享目录 `G` | 当前代码库的真实 Git 共享目录 | 独立工作树（Worktree）的提供者登记，不是业务任务表 |

默认情况下，macOS 的正式应用使用 `~/Library/Application Support/Buildr`，开发应用使用 `~/Library/Application Support/Buildr Dev`；Windows 位于本机应用数据目录，Linux 遵循状态目录约定。产品根与应用根可能恰好相同，但不是同一个语义对象，也不共享同一个覆盖参数。

预览（Preview）还有自己的根 `B`：使用 `buildrWebDataRoot()` 解析的应用覆盖目录，否则使用系统默认产品数据位置；不要用 `BUILDR_PRODUCT_DATA_DIR` 推测它已被隔离。实际维护应消费路径解析结果，而不是复制一套路径猜测。

依据：[应用运行配置与各平台默认路径](../../../services/buildr/src/modules/installation/contracts/web-profile.ts)、[产品数据根](../../../services/buildr/src/infrastructure/filesystem/product-data-root.ts)、[预览路径](../../../services/buildr/src/web/application/preview-lifecycle.ts)。

## 二、安装和应用登记：知道“从哪里来”和“由谁管理”

| 数据与位置 | 保存内容和写入者 | 丢失的影响 |
| --- | --- | --- |
| `P/product-installations.json` | 安装来源、产品与入口路径、Node 身份、更新依据；安装登记模块写入 | 安装本体不因此消失，但发现和更新依据受影响；重新登记需要核对真实安装 |
| `A/workspace-registry.json` | 规范化的工作目录列表与最近打开目录；登记、移除和打开操作维护 | 可重新登记目录，但不能推断原列表与最近打开选择；不包含业务正文 |
| `W/.buildr/local/web-management.json` | 当前工作目录身份、规范路径、管理应用归属与认领信息；管理边界模块维护 | 影响不同应用之间的归属判断；缺失不应直接解释为无人管理 |
| `A/instance.json` | 应用地址、进程标识、实例密钥、产品与运行配置（Profile）身份；应用启停代码维护 | 运行中失去发现及安全识别依据；重启可以形成新实例，但不能靠旧进程号认领新进程 |
| `A/instance-start.lock` | 防止并发启动争用的锁（Lock） | 先核对持有者；删除文件不是解决并发冲突的默认方式 |
| 启动器的 `launcher-binding.json` | Node、包入口和启动策略的绑定；启动器安装与修复代码维护 | 可以按真实安装重建，不能凭文件存在就认定绑定仍有效 |

macOS 的绑定文件位于启动器目标的 `Contents/Resources/`，Windows 的 npm 启动器使用 `P/launchers/npm/`。这组 JSON 文件不是另一个数据库，也不复制工作空间（Workspace）里的项目（Project）或任务（Task）。

`instance.json` 含实例密钥。文档可以解释字段职责，但示例、图示、版本管理和故障报告不能携带真实密钥。调用外部命令所需的令牌、登录态和个人配置同样不应进入共享资产。

依据：[安装登记](../../../services/buildr/src/modules/installation/infrastructure/installation-registry.ts)、[工作目录登记](../../../services/buildr/src/modules/workspace/persistence/workspace-registry-repository.ts)、[管理归属](../../../services/buildr/src/modules/workspace/infrastructure/workspace-management-fence.ts)、[实例读写](../../../services/buildr/src/web/infrastructure/instance-runtime.ts)、[启动器绑定](../../../services/buildr/src/modules/installation/infrastructure/npm-launcher.ts)。

## 三、工作位置和预览：记录归属，不证明任务完成

### 独立工作树（Worktree）

`G/buildr/task-worktrees/<task-id>.json` 保存提供者核对过的目录、分支、起点、仓库身份和创建效果；实际工作副本位于 `W/.worktrees/<task-id>/`，多仓库时还包含相应的嵌套位置。

这份记录不承担任务（Task）状态、环境就绪或成果交付证明。它与 Git 当前登记、分支和实际文件要共同核对。登记文件丢失会妨碍安全识别；即使能从 Git 重新发现目录，也不能恢复已经丢失的未提交内容，更不能据此直接清理。

### 预览（Preview）

`B/previews/<name>/` 中：

- `preview.json` 保存命名实例、工作副本、任务（Task）与产品位置等归属信息。
- `instance.json` 保存子应用的运行与认证信息。
- `preview.log` 保存这次运行输出。

预览（Preview）模块负责启动、健康检查、复用和认证停止。名字、端口、进程号都可能复用，因此停止前不能只根据其中一个字段判断归属。重新启动可以生成新的运行记录，但旧日志与当时现场不保证复原。

依据：[工作树提供者](../../../services/buildr/src/modules/task/infrastructure/git-worktree-provider.ts)、[预览生命周期与归属](../../../services/buildr/src/web/application/preview-lifecycle.ts)。

## 四、源资产与投射回执：能生成正文，不代表能生成旧所有权

技能（Skill）的源正文和附件放在工作空间（Workspace），不同智能体运行时（Agent Runtime）接收适合自身入口的派生文件。此过程还需要记录“哪些目标文件是本次管理的”，避免下次更新误删其他内容。

用户级和工作空间（Workspace）级的技能投射回执（Receipt）分别位于：

```text
W/.buildr/agent-runtime/workspace/<adapter>/skill-projection-ownership-receipts/
H/.buildr/agent-runtime/user/<adapter>/skill-projection-ownership-receipts/
```

每份回执（Receipt）按对应运行路径定位，记录来源与资产身份、渲染摘要、文件清单、完整性、可执行状态及适用的能力绑定（Binding）信息。`W/.buildr/builtin-receipts.json` 还记录随包资产的受管事实；这些与原始正文不是同一份数据。

- 派生正文可以根据当前源重建，但应先确认目标归属、现有内容和冲突。
- 回执（Receipt）丢失后，不能仅因文件内容相似就恢复旧所有权或允许删除。
- 多个管理者使用同一目录时，路径相同不代表当前管理者拥有它。清理由对应所有者承担。
- 源已修改、已生成新入口、宿主已发现、当前会话已采用，是不同事实；回执（Receipt）不证明最后两项。

Qoder 当前受管技能（Skill）入口使用 `.qoder/skills`，不为 Qoder 额外写入 `.agents/skills`。后者即使能被宿主发现，也可能由其他适配器（Adapter）或用户维护；这一区别直接影响回执（Receipt）归属和清理范围。

依据：[投射回执路径](../../../services/buildr/src/modules/agent-assets/infrastructure/runtime/skills/projection-files.ts)、[受管协调写入](../../../services/buildr/src/modules/agent-assets/infrastructure/runtime/runtime-reconciler.ts)、[随包同步范围](../../../services/buildr/src/modules/agent-assets/application/package-maintenance/sync-plan.ts)、[技能投射详解](buildr-skill-system.md)。Qoder 单根规则按 `a98b89f2` 对应的当前实现与规范核对。

## 五、中断恢复：这是恢复证据，不是可随意清空的日志

### 多文件源资产写入

`W/.buildr/mutations/` 是受管文件事务（Transaction）的工作区，包括 `lock.json`、操作目录内的 `journal.json` 和 `backup/` 前镜像。成功完成或成功回滚后，执行器清理相应现场；失败时保留用于诊断和恢复。

假如三个关联清单只写完两个便中断，当前目录本身不一定足以还原写入前的关系。此时删除备份和记录，会直接丢失恢复依据。人工触发恢复还可能留下 `recovered-<id>.json`；它描述恢复结果，不成为新的资产源。

### OpenSpec 归档恢复

相关变更目录下的 `.buildr/convergence-receipt.json` 保存输入身份、修改前与预期内容及摘要，用于判断中断后实际文件到了哪一步。正常归档与核对成功后释放这份记录；归档后的正式规范和材料继续保存成果。

它不是所有历史变更的永久审计库，也不是某个回执（Receipt）还在就允许继续写入。变更内容、执行工具身份或实际文件已变化时，恢复要重新核对，不能重放过时输入。

依据：[文件事务现场](../../../services/buildr/src/infrastructure/filesystem/workspace-mutation.ts)、[恢复动作](../../../services/buildr/src/modules/workspace/application/workspace-operations.ts)、[OpenSpec 归档与恢复](../../../services/buildr/src/modules/openspec/application/openspec-converge.ts)。

## 六、本机阅读成果：可以重新生成，不保证还是原来那份

每日演进保存在 `W/.buildr/daily-progress/<project>/<date>.yml`，保存日期、记录时间、四问摘要、提交及作者信息、任务（Task）关联与文件范围。应用负责校验并保存调用方提交的文档；它不是从当日任务（Task）自动推出的全部活动事实。重新分析同一天的 Git 提交，可以形成另一份说明，但不保证恢复原来的措辞、判断与当时可见范围。

复盘正文保存在 `W/.buildr/local/task-retrospectives/<task-id>.md`，由智能体（Agent）在用户授权后编写。数据库只保存摘要和待决定或已决定状态；正文丢失时，数据库并没有一份可直接还原的隐藏副本。

知识文章与图示虽常位于 Git 管理的 `knowledge/`，也属于需要保存的成果。只有由已保留图源确定生成的展示文件才能准确再生成；不能把自由编写的解释文章视为生成缓存（Cache）。

依据：[每日演进持久化](../../../services/buildr/src/modules/task/daily-progress/persistence/project-daily-progress-repository.ts)、[每日演进写入](../../../services/buildr/src/modules/task/daily-progress/application/project-daily-progress-application.ts)、[复盘文档读取与摘要核对](../../../services/buildr/src/modules/task/persistence/task-retrospective-document.ts)。

## 七、备份与恢复应按对象区分

1. **共享源文件**：保存源资产与版本；跨多个真实 Git 仓库时分别核对，不能认为复制一个外层目录就包含所有代码。
2. **SQLite 与本机正文**：数据库、复盘和每日演进各有独立内容。数据库使用预写日志（Write-Ahead Logging，WAL）；运行中不能把复制主 `.sqlite` 文件等同于一致备份，应使用 SQLite 一致备份方式或经核对的停止后复制。
3. **运行记录**：先核对活跃进程和所有权，再由相应能力停止或重建，不将删除记录当作停止程序。
4. **未完成恢复现场**：保留操作记录、备份和实际文件，依据当前事实恢复；不能为了通过诊断而先清空现场。
5. **可生成文件**：以保留的源、生成器和真实所有权为前提重建。搜索索引（Search Index）可重建，不意味着包含原始业务记录的数据库可删除。

这里说明的是数据责任，不承诺 Buildr 已提供统一备份、云端同步或跨机器自动恢复工具。迁移一项工作时，应明确哪些内容随源共享、哪些只在本机、哪些必须重新观察；这比“备份整个 `.buildr`”或“清掉全部本机数据”都更准确。
