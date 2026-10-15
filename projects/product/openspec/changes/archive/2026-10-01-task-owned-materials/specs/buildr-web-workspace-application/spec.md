## RENAMED Requirements

- FROM: `### Requirement: Task 概览必须以关联 Change Brief 为主要说明`
- TO: `### Requirement: Task 说明必须由独立材料引用提供正文`

## MODIFIED Requirements

### Requirement: Task 说明必须由独立材料引用提供正文
Buildr Web MUST 在任务详情的说明节点，通过独立任务材料应用（Task Materials Application）读取该任务正式关联的唯一任务说明（Task Brief）真实正文，MUST NOT 以 OpenSpec Change、intent 或聊天作为唯一说明来源。Task title、intent、范围和其他专业事实 MUST 保持各自可读。任务可以关联零到多个 Change，变更说明（Change Brief）MUST 作为具体规范变化的辅助阅读来源；旧任务没有独立说明引用时 MUST 保留带来源的历史 Change Brief 只读兼容入口，不宣称已建立独立任务说明，不合并多个 Brief，也不选主 Change。

#### Scenario: 查看含 Brief 的关联 Change
- **WHEN** 用户打开含有可解析 Change 引用且该 Change 提供 Brief 的任务
- **THEN** 页面 MUST 保留该 Change Brief 原文和 Change identity 的只读阅读入口，并与独立任务说明区分
- **AND** 页面 MUST 提供从当前 Task 进入该 Change 技术 artifacts 的 Task-scoped 链接

#### Scenario: 一个 Task 关联多个 Change
- **WHEN** Task Record 保存多个 Change 引用
- **THEN** 页面 MUST 按每个已保存引用分别提供可用 Change Brief 或其不可用状态，独立说明节点仍读取唯一 Task Brief
- **AND** 页面 MUST NOT 推断、标记或合并任一“主 Change”，也不得用旧 Brief 覆盖显式说明引用

#### Scenario: Brief 或关联 Change 不可用
- **WHEN** 已保存的 Change 引用无法解析，或可解析 Change 没有 Brief
- **THEN** 页面 MUST 展示该引用的真实 unavailable 状态
- **AND** Task 的 title、intent、独立材料和其他可用事实 MUST 继续可读
- **AND** 页面 MUST NOT 生成、保存、推断或从全局目录查找 Brief

#### Scenario: Task 没有关联 Change
- **WHEN** Task Record 没有 Change 引用
- **THEN** 页面 MUST 显示明确的无关联 Change 状态，并独立读取正式任务材料；有 Task Brief 时 MUST 直接展示其正文
- **AND** 页面 MUST NOT 扫描 Workspace、Project 或 Worktree 以发现 Change，也不得因空 `changes` 而跳过说明读取

#### Scenario: 已有关联说明当前不可读
- **WHEN** 任务已明确关联 Task Brief，但正文缺失、读取失败或来源身份漂移
- **THEN** 应用 MUST 保留引用与逐项诊断，页面 MUST 如实显示独立说明缺口
- **AND** MUST NOT 自动改用 Change Brief、intent 或其他同名文档伪装说明已齐备

### Requirement: Task详情必须只读展示current任务验证报告
Buildr Web MUST 在开发实现节点按需展示任务验证报告（Task Verification Report）的存在性、内容版本、Task scope、测试地图、实际 checks、gaps、结论、report digest、完成时间和现有 current/stale/unknown applicability。页面 MUST 通过任务验证应用（Task Verification Application）读取，MUST 不从 Development gate 或 Execution Record 派生报告。检查的执行状态、未覆盖理由与业务不适用 MUST 分别表达；没有报告 MUST 只表示未记录，不自动推断通过、失败或不适用。

#### Scenario: 查看已有报告
- **WHEN** 用户打开有 current 任务验证报告的开发实现节点
- **THEN** 页面 MUST 显示实际测试体系、选择范围、targets、结果、未覆盖项和结论
- **AND** GET MUST 不执行测试、观察 Git 或修改 Task 事实

#### Scenario: 报告不存在
- **WHEN** Task 尚无报告
- **THEN** 页面 MUST 显示未记录的真实空状态，可提供交给智能体（Agent）按目标判断与验证的入口
- **AND** 其他 Task 专业视图 MUST 正常工作，MUST NOT 因没有 Change 或报告而把验证表述为不适用

#### Scenario: 检查未覆盖而非执行失败
- **WHEN** 报告的 gaps 表明必要范围未执行、环境不可用或缺少测试，而 checks 保留实际 passed/failed 结果
- **THEN** 页面 MUST 分别呈现实际执行结果、缺口与原结论，保留具体原因
- **AND** MUST NOT 新增检查枚举、把所有缺口统一显示为“未通过”或把必要但未完成改成不适用

### Requirement: Buildr Web Task 页面必须退出研发与旧交付历史
Buildr Web MUST 以任务记录（Task Record）为任务短目标、状态和结果权威，以独立任务材料应用（Task Materials Application）的引用与真实文件为说明及过程材料来源，按需读取 Review、Verification、Parent facts 与 Task Record 拥有的本机复盘文档。页面 MUST 不请求或展示 Development、Task Environment、Task Candidate、Handoff、Task Planning Identity、Terminal Delivery、旧 Finish history 或独立 Retrospective Application。材料与专业结果 MUST 不被复制为 Web 专用业务状态或统一完成决定。

#### Scenario: 查看没有Development的Task
- **WHEN** 用户打开任意todo、active、completed或abandoned Task
- **THEN** 页面 MUST 正常展示概览、适用任务材料、原型和专业证据；todo 的意向边界 MUST 保持不变，读取不自动形成正文
- **AND** 概览中的复盘卡片缺少登记时 MUST 保持简单空态且不自动提示或写入

#### Scenario: 完成任务
- **WHEN** 用户通过现有Task Record动作完成Task
- **THEN** 页面 MUST展示Task Record保存的结果
- **AND** MUST不要求或查询Development、Environment、Finish history或Retrospective结果证明

## ADDED Requirements

### Requirement: 普通任务材料必须独立于 OpenSpec 读取并复用文件边界
任务材料命令行与任务限定超文本传输协议（HTTP）入口 MUST 调用同一独立材料应用（Task Materials Application），通过正式任务查询确认任务存在，再按已登记项目范围和受管工作树（Worktree）证据复用普通 Markdown 文件读取边界。普通材料读取 MUST 不依赖 OpenSpec Query、Change availability 或 Change artifact 发现。清单 MUST 固定为主工作空间（Canonical Workspace）的 `.buildr/local/task-materials/<task-id>/materials.json`，只保存唯一说明及零到多个方案、实施、交付的逻辑引用；正文 MUST 来自同任务本机 Markdown 或 Task scope 内的项目相对 Markdown，不复制入清单或 Task Record。

#### Scenario: 没有 Change 的普通任务
- **WHEN** 任务存在且合法材料引用指向任务本机或 scope 内项目正文，但没有 OpenSpec Change
- **THEN** 命令行与 HTTP MUST 返回相同材料引用、当前正文、来源、实际摘要和逐项诊断
- **AND** MUST NOT 为读取调用 OpenSpec 查询、扫描 Change 或要求创建虚假项目及 Change

#### Scenario: 项目正文位于候选工作树
- **WHEN** 合法项目来源引用对应可证明身份的 matching Worktree
- **THEN** 普通读取 MUST 使用该候选实际文件根及未提交正文，并保持后续相对导航的任务现场
- **AND** 缺失或身份冲突 MUST 返回局部诊断，MUST NOT 静默回退 retained 同名旧正文

#### Scenario: 归档后读取稳定任务说明入口
- **WHEN** 用户在 active 或 archived Change Brief 中点击 `@project/tasks/<task-id>/brief.md` 形式的限定项目根逻辑引用
- **THEN** 文档解析 MUST 在同一已确认任务及项目范围内打开相同任务说明，不按 Change 目录深度拼接
- **AND** 普通相对 Markdown 引用 MUST 保持原语义，逻辑前缀 MUST NOT 成为任意 Workspace 路径入口

#### Scenario: 材料读取零写入
- **WHEN** 客户端 inspect、打开或刷新任务材料
- **THEN** 应用 MUST 只返回当前材料事实，不更新清单、Task Record、系统时间、状态或专业结果
- **AND** Task 列表 MUST 不扫描材料正文，不批量生成或迁移历史说明

### Requirement: 任务材料接口必须保护身份范围和独立观察版本
任务材料接口（API）MUST 先解析已登记 Workspace 与真实 Task，使用固定 task-local 或限定 project-relative 来源，不接受任意 root、target、绝对路径或工作树物理路径。路径穿越、符号链接、非普通文件、非法编码与超限正文 MUST 被拒绝，单项失效 MUST 只影响相应材料。关联写入 MUST 使用已观察 `expectedCurrent`，任务本机正文写入 MUST 使用已观察 `expectedDocumentDigest`，保持各自版本保护与原子发布；项目正文继续通过真实工作树文件工具维护，HTTP MUST 不提供任意项目文件写入。写请求 MUST 复用同源、session、JSON、请求体大小与未知字段拒绝边界。

#### Scenario: 陈旧引用或正文写入
- **WHEN** 关联清单或任务本机正文在读取后已被另一入口修改
- **THEN** 对应写入 MUST 明确返回冲突且保留现有事实，调用方 MUST 重读后判断
- **AND** MUST NOT 静默覆盖、自动重放或通过 Task Record mutation 保存材料版本

#### Scenario: 删除失效引用
- **WHEN** 旧材料引用失效而调用方按当前关联版本明确解除该引用
- **THEN** 应用 MUST 允许可独立验证的解除关联，不因其他未新增旧引用不可用阻塞整个更新
- **AND** 解除引用 MUST 不删除正文、任务或专业结果

#### Scenario: 伪造其他任务或任意路径
- **WHEN** 请求指向不存在任务、其他任务固定目录、scope 外项目或越界路径
- **THEN** 接口 MUST 在对应文件读写前拒绝请求且零副作用
- **AND** MUST NOT 回退当前目录、其他任务或同名主目录文件

#### Scenario: 任务材料不接管专业权威
- **WHEN** 某项材料写入或读取失败，但 Task Record 与专业结果自身有效
- **THEN** 页面及命令行 MUST 保留其他安全可读事实，材料应用 MUST 不计算审查适用性、验证结论或任务完成许可
- **AND** MUST NOT 自动修改旧 brief、归档、专业历史或任务状态
