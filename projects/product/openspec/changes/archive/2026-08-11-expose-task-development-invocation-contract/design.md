## Context

Task Development Application 对各 action 输入执行 closed-field 与语义校验，但 driver 只暴露 action 名称和公共参数。Agent 无法在调用前机器读取 `begin`、`planning`、`policy` 等 action 的输入层级，只能从 Application 源码和测试反向推断。

本变更只改善随包内部 driver 的发现能力。它不把 Task Development 注册为公共 Buildr CLI，也不改变 Application、Receipt 或 lifecycle authority。

## Goals / Non-Goals

**Goals:**

- 无需 Task、Workspace 或 runtime composition，即可发现 action 列表、用途、输入 schema 和最小示例。
- 让 Application 顶层 closed-field 校验与 driver schema 读取同一 action contract。
- 保持普通 action 和 `--profile` 的现有输出及副作用不变。
- 对发现输出建立稳定、可测试的版本化 JSON envelope。

**Non-Goals:**

- 不推广为所有 Buildr 命令的统一 schema 框架。
- 不引入 JSON Schema validator 或第三方依赖。
- 不把跨字段、Task 状态、Environment、Change lifecycle 等运行态语义完整编码进静态 schema。
- 不新增公共 `buildr task development` CLI，也不修改 Local App。
- 不提供 OpenSpec artifact 骨架命令。

## Decisions

### 1. 使用 action contract 作为发现与顶层字段校验的共同来源

在 Task Development Application 模块附近维护按 action 索引的 closed contract，包含说明、JSON Schema 与最小示例。Application 的顶层 `assertFields` 从对应 schema 的 `properties` 取得允许字段；driver 直接读取同一 contract 输出发现结果。

选择这一方式，而不是在 driver 中手写帮助文本，是为了让新增或删除顶层字段时必须同时改变 Application 实际消费的白名单。深层业务约束继续由现有领域/Application 校验承担，schema 通过 description 标明运行态约束，避免再实现一套通用验证器。

### 2. 发现请求不要求 `--task` 或 `--target`

支持：

- `task-development-driver.mjs --help`
- `task-development-driver.mjs <action> --help`
- `task-development-driver.mjs <action> --schema`
- `task-development-driver.mjs <action> --example`

这些请求只加载 action contract，不创建 runtime、不访问 Workspace，也不写 Development Receipt。普通 action 仍要求 `--task` 与 `--target`。

### 3. schema 使用 closed JSON Schema，示例使用版本化 envelope

每个 action 的 input schema 使用 JSON Schema Draft 2020-12 子集，根对象固定 `additionalProperties: false`。发现输出分别使用：

- `buildr.task-development-driver-help/v1`
- `buildr.task-development-driver-schema/v1`
- `buildr.task-development-driver-example/v1`

示例值只表达最小结构；identity、Project、Change 等占位值不宣称对任意 Task 都可直接执行。无输入 action 返回 `{}`。

### 4. 保持执行路径兼容并拒绝歧义发现请求

普通 action 继续返回原 operation result；`--profile` 继续返回 profile envelope。未知 action、缺少 action 的 `--schema|--example`、以及同一请求同时选择多个发现模式均返回 usage error，不进入 runtime。

## Risks / Trade-offs

- **风险：静态 schema 无法表达全部运行态约束** → schema description 明确 Task/Environment/current identity 等仍由 Application 校验，不把 schema 宣称为可离线证明业务合法性。
- **风险：嵌套字段仍可能与领域 normalization 漂移** → 本任务至少让顶层字段白名单同源，并以测试固定关键嵌套 shape；后续只有出现真实漂移证据时再扩大同源范围。
- **风险：contract 变成跨 Buildr 通用框架** → 模块、协议和测试均限定在 Task Development driver，不建立全局 registry。
- **取舍：示例采用占位值而非动态生成真实 payload** → 保持发现操作零 Workspace 读取、零副作用，Agent仍需结合 current Task facts填充实际值。
