## ADDED Requirements

### Requirement: Task checkout/provider evidence 必须是 Environment 的源码版本基础
Task Environment MUST 以 Receipt scopes、实际 execution roots 与适用 provider evidence 表达 Task 的源码版本基础。对于 Git task checkout，start point、branch、HEAD、checkout/registration/clean evidence MUST 决定该 Task 当前源码位置；retained Workspace 或 retained Buildr 的后续前进 MUST NOT 自动更新、失效或重写该基础。

#### Scenario: retained Workspace 从 M1 前进到 M2
- **WHEN** Environment Receipt 登记的 Task checkout 仍位于 M1，而 canonical retained Workspace 与 Buildr 已正常前进到 M2
- **THEN** `inspect` 与 `prepare` MUST 继续描述并探测 M1 Task checkout 的 provider、Runtime/CLI、依赖、projection 与资源事实
- **AND** MUST NOT 仅因 retained controller content identity 不同而报告 Environment broken、改写 lifecycle generation 或使 Review/Verification evidence 失效

#### Scenario: Task 尚未选择吸收 M2
- **WHEN** 用户、Task Development 或 Finish 尚未明确执行更新 Task checkout 的 Git 操作
- **THEN** Task Environment MUST NOT fetch、rebase、merge、reset 或自动同步 Task 源码
- **AND** MUST 保留原 start point、branch、HEAD 与 execution root evidence

#### Scenario: Task 显式更新到 M2
- **WHEN** Task Development/Finish 通过显式 Git 操作改变 Task checkout 或 Candidate identity
- **THEN** Task Environment MUST 在下一次 `prepare`/`inspect` 中按新的 checkout、provider、CLI、依赖、projection 与资源事实重新判断 ready
- **AND** Review/Verification MUST 按新的 Candidate/target identity独立判断 evidence applicability

### Requirement: Retained Environment Manager 必须可信但不得成为源码版本 authority
Task Environment mutation MUST 由 canonical retained Workspace 的可信 Environment Manager 执行。当前 manager 若来自 Git checkout，其实际实现输入 `bin/`、`src/`、`package/`、`package.json`、`package-lock.json` MUST 没有 staged、unstaged 或 untracked 变化；clean probe MUST 排除 `.buildr/`。Receipt `controller.identity` MAY 作为创建该 Receipt 的 Buildr 实现指纹或兼容诊断，但 MUST NOT 成为 ready、resource ownership、Verification applicability 或 Task checkout 等价性的匹配门槛，也 MUST NOT 在 retained manager 升级时自动改写为 lifecycle generation。

#### Scenario: 首次 prepare 遇到 dirty Git manager
- **WHEN** Git-backed retained manager 的任一实现输入存在 staged、unstaged 或 untracked 变化，且 Task 尚无 Environment Receipt
- **THEN** `prepare` MUST 返回 blocked manager-dirty diagnostic 与空 effects
- **AND** MUST NOT 创建或更新 Environment Receipt、worktree/provider evidence、依赖或 runtime projection

#### Scenario: 只有 `.buildr/` lifecycle metadata 变化
- **WHEN** retained manager 的实现输入 Git clean，但 canonical Workspace 的 `.buildr/tasks/**` 或其他 `.buildr/` 内容发生变化
- **THEN** manager clean probe 与创建指纹计算 MUST 保持不受影响
- **AND** Environment 操作 MAY 继续执行其既有 authorization 与真实 probe

#### Scenario: Receipt 创建后的 manager content identity 改变
- **WHEN** 当前 clean retained manager 的 sourceRoot/adapter 仍可信，但 content identity 与 Receipt 创建指纹不同
- **THEN** `inspect`、`prepare`、resource mutation 与已授权 `cleanup` MUST NOT 因该差异阻断或自动更新 `controller.identity`
- **AND** result MUST NOT 返回 controller handoff、rebind 或 generation-transition effect

#### Scenario: candidate 只读检查自己的 Environment
- **WHEN** task worktree 中的 candidate Buildr 使用匹配 Task ID 与 canonical Workspace 请求只读 `inspect`
- **THEN** Application MAY 返回当前 Task checkout/provider/foundation/resource probe
- **AND** candidate Buildr MUST NOT 因该读取而创建、恢复、认领、释放或清理自己的 Environment

#### Scenario: Environment Manager 不可信
- **WHEN** mutation 入口来自 candidate linked worktree、Receipt 登记外的 sourceRoot/adapter、dirty Git source 或无法取得可信 Git clean evidence
- **THEN** `prepare`、resource register/release 与 `cleanup` MUST 在对应持久效果前 fail closed
- **AND** MUST 保留原 Receipt、Task checkout、provider evidence 与动态资源

## MODIFIED Requirements

### Requirement: Task-owned 持久资源必须立即登记并由 provider 清理
正式 Task 中会跨有界操作持续存在、需要最终清理或影响并发的 Preview、dev server、端口、容器、临时数据库等资源 MUST 在创建成功后立即通过 Task Environment 登记。资源条目与 provider owner MUST 绑定 Task ID、canonical Workspace、Environment root、resource ID、工作范围、已知 provider、provider identity、非敏感 cleanup handle 与真实 probe；MUST NOT 使用 retained Buildr controller content identity 作为 ownership 条件，Receipt MUST NOT 接受任意 cleanup 命令。

#### Scenario: 成功启动持久资源
- **WHEN** 已登记 provider 启动一个健康的 Task-owned 持久资源
- **THEN** 创建者 MUST 在报告 start 成功前调用 Environment `resource register`
- **AND** receipt MUST 返回可核验的 resource identity、owner、scope、provider 和 cleanup responsibility

#### Scenario: 资源登记失败
- **WHEN** 资源已经创建但 Environment Receipt 更新失败、owner 不匹配或 scope 不允许
- **THEN** 创建者 MUST 立即调用原 provider 停止/释放刚创建的资源并证明回收
- **AND** MUST NOT 向调用方报告资源已由 Task Environment 管理

#### Scenario: retained Buildr 升级后停止已有 Preview
- **WHEN** Preview owner 与 Receipt resource 的 Task、Workspace、Environment root、resource ID、provider identity/handle 全部匹配，但当前 retained Buildr content identity 已变化
- **THEN** provider MUST 允许已授权的 probe、stop 与 cleanup继续按 resource ownership 执行
- **AND** MUST NOT 因旧 owner 中缺少或包含不同 `controllerIdentity` 而拒绝、接管或改写资源

#### Scenario: 一次性命令正常结束
- **WHEN** 构建、测试或其他有界进程已经正常结束且不留下持久资源
- **THEN** Task Environment MUST NOT 为该进程创建动态资源条目
- **AND** Verification evidence MUST 继续由 Task Verification 自己维护

#### Scenario: cleanup handle 请求任意命令
- **WHEN** 调用方尝试把 shell 文本、凭证或未知 provider 写入 resource cleanup 字段
- **THEN** Environment writer MUST 拒绝整个 mutation 并保持原 receipt
- **AND** MUST 只允许产品已登记 provider 的结构化 identity/handle
