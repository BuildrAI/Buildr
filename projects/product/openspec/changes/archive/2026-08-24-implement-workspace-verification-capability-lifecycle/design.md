## Context

现有 Project 根 `verification.yml` 使用 closed `buildr.project-verification/v2`，以 `applicability.paths/conditions` 加一个 invocation 表达 capability。它能可靠执行既有入口，但不能区分验证目标、affected/full 选择和 Static/Unit/Component/Integration/System 证据，也没有统一 Plan authority。Buildr Product 已有成熟 registry/DAG/planner，普通 Workspace 则不应被迫复制这套内部复杂度。

本次迁移发生在受控试点阶段。live v2 使用者可全部协调更新，因此不保留 reader/adapter；归档 Change 和 Git 历史保持不可修改。Task Environment、Execution Record、Verification Result、Task Development 与 Finish 的既有 authority 不被声明模型接管。

## Goals / Non-Goals

**Goals:**

- 用唯一 `buildr.project-verification/v3` 表达稳定 Test Capability Family。
- 为 Task Delivery、Product Artifact Candidate 与 Published Release 形成 closed Verification Request/Plan，并支持 affected/full 选择。
- 让普通声明可以依赖源码、构建配置、Tag、Suite 和模块事实；让复杂 Project 通过 provider adapter 接入。
- 保存逐项直接触发、依赖扩张、证据边界、证明事实、full reason 与 coverage gap。
- 一次性迁移全部受控 live v2，并删除 active v2 runtime、规范、文档、Skills 和测试。

**Non-Goals:**

- 不把具体测试类、测试文件、Product registry step 或 DAG 写入 `verification.yml`。
- 不建立跨 Project 通用依赖分析平台，也不要求普通 Workspace 实现 provider。
- 不改变 Product Candidate、Published Release、Task Candidate、风险接受或 Finish authority。
- 不修改归档 OpenSpec 历史；不以本任务直接写入其他 Workspace 来绕过其 Task/Git authority。

## Decisions

### 1. v3 是单一 closed schema，不提供 v2 adapter

Project 根仍是唯一发现入口。v3 顶层保留可选 `resources` 和 `capabilities`；每个 capability 包含：

- `id`、可选 `title`、`scope.project/services`；
- 非空 `proves`、非空 `evidence`（`static|unit|component|integration|system`）；
- 非空 `usableFor`（`task-delivery|product-candidate|published-release`）；
- `discovery.sources`，只指向真实构建/测试/registry authority；
- `invocation.full`，以及可选 `invocation.affected`；每个入口为现有 `command|agent|provider`；
- 可选 environment/effects/resource claims，沿用现有 admission 边界。

若没有可信 affected 入口，planner 选择 full 并记录 reason；不得把单一旧 invocation 自动声称为 affected。相比兼容 reader，单版本 parser 能让 Doctor、Skills、测试和用户只面对一个契约，也给删除留下确定完成条件。

### 2. Request、Plan、Execution Record、Result 单向引用

Request 是本次冻结输入：target、selection scope、decision、changed paths、risks 和 declaration identities。Plan 由 Request 与声明/Provider 确定性派生，包含 `requestIdentity`、`planIdentity`、selected items、selection trace、coverage gaps 和 execution units。

Execution Record 保存 matching request/plan、实际 invocation、输出、耗时、资源与清理事实；Result 继续只提炼 current Candidate、capability facts、portable evidence identities、gaps 与结论。Result 不复制完整 Plan 或输出。Plan preview 不是执行证据。

### 3. 普通 planner 采用 fail-closed 的两级选择

通用 planner 先按 Project/Service scope、changed paths 与 `discovery.sources` 选择 capability family，再选择入口：可信 affected 入口用于 Task Delivery affected；否则扩大到 capability full。未知 owner、关键选择 authority 变化或 declaration/provider 无法解析时返回 owner gap、full reason 或 blocked diagnostic，不返回空 passed。

跨 Project/Service 依赖只消费构建图或显式 provider 返回的可信关系；无法确认时扩大或 gap。这样覆盖常见 Maven/npm 项目，同时不制造通用 DAG。

### 4. 高级 provider 只返回统一 Plan/Execution facts

`invocation.kind: provider` 使用稳定 provider id 解析 Task Environment 内已注册 adapter。adapter 接收 closed Request，返回 closed Plan/Execution units；Buildr Product adapter 可以读取内部 registry/DAG/Context Runtime，但公开结果只暴露 selected item、reason、evidence、proves、resource needs 与 invocation identity。provider 不得写 Result 或改变 Task lifecycle。

### 5. 迁移以 active authority 零 v2 引用为完成条件

先实现 v3 parser/planner/provider contract 和测试，再迁移 Product live declaration及随包模板/Skills；集鲜三个 Project 在各自正式 Workspace 中迁移并验证。最后删除 v2 reference、diagnostic wording、fixtures 和兼容分支，并以排除 archive/Git history 的静态扫描证明 active authority 为零。

Roadmap 从“目标架构”更新为已实现/剩余事实；canonical specs 与 glossary 由 Change convergence 收敛。归档路径中的 v2 只作为 provenance，不参与 runtime 或文档入口。

## Risks / Trade-offs

- [跨 Workspace 迁移不能由一个 Product worktree原子提交] → Product 先提供 v3 能力；集鲜由其正式 Task/Git authority 迁移，Parent acceptance 汇总各 Workspace 证据。在全部受控 live 声明完成前不宣告 Parent 完成。
- [affected discovery 误收窄导致漏测] → affected 必须有显式入口和可信 source/owner；不确定时扩大 full 或形成 gap，关键 planner/registry 变化强制 full。
- [v3 字段增加声明维护成本] → 只声明少量稳定能力族，具体测试继续留在构建工具与源码；可省略 affected 而安全使用 full。
- [Product provider 泄漏内部 DAG] → adapter 输出 closed public Plan，contract tests 拒绝 registry step graph 和 Context 内部字段。
- [破坏性升级使旧声明立即 invalid] → 在发布/激活前迁移全部受控 live 使用者；Doctor 给出明确 v3 migration diagnostic，不提供隐式兼容。

## Migration Plan

1. 在 Product worktree实现 v3 parser、normalizer、Doctor、Request/Plan 与 provider ports，并用 isolated fixtures 验证 v2 明确 invalid。
2. 迁移 Buildr Product `verification.yml`、Skills、template/reference、package assets、CLI 文档和所有 active fixtures/tests。
3. 为 Buildr Product registry 实现高级 adapter；验证 affected、full、Candidate 和 release-only 对象不混用。
4. 在集鲜 Pig、FreshX、Foundation 各自正式 authority 中迁移 live 声明；记录 gap、affected、依赖扩张和 full 反例。
5. 扫描 active runtime/canonical specs/docs/Skills/tests，删除全部 v2 支持与过时兼容表述；archive provenance 例外单独报告。
6. strict validate、OpenSpec preflight、实现测试与 current knowledge reconcile 后执行唯一 convergence/archive。

回滚只允许在激活前回滚整个 Product delivery 与对应 Workspace migration commit；不重新引入双读 adapter。若某个受控 Workspace 尚未迁移，则阻止该版本激活或 Parent acceptance。

## Open Questions

- 无阻塞问题。Service 物理分文件暂不引入；第一版继续只读取 Project 根 `verification.yml`。
