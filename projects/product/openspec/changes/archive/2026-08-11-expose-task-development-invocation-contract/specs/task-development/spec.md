## ADDED Requirements

### Requirement: Task Development driver 必须提供同源调用契约发现

Task Development 内部 driver MUST 为每个受支持 action 提供无需 Task 或 Workspace 上下文的 action 级帮助、机器可读输入 schema 与最小输入示例。输入 schema MUST 是 closed JSON object shape，并且 Application 对该 action 的顶层字段白名单 MUST 与 driver 输出读取同一 action contract；发现操作 MUST NOT compose runtime、访问 Workspace、写入 Development Receipt 或产生其他专业副作用。

静态 schema MUST 区分结构约束与仍需 Application 结合 current Task、Environment、Change、identity 或专业 Result 判断的运行态约束。系统 MUST NOT把 schema 或示例解释为任意 Task 上均可执行的业务合法性证明。

#### Scenario: 查看全局帮助

- **WHEN** Agent 在没有 `--task` 和 `--target` 的情况下对 Task Development driver 请求 `--help`
- **THEN** driver MUST 返回所有受支持 action、公共执行参数以及 action 级 `--help`、`--schema`、`--example` 的发现方式
- **AND** 请求 MUST 不 compose runtime、不访问 Workspace且不产生持久化 effect

#### Scenario: 查看 action schema

- **WHEN** Agent 对一个受支持 action 请求 `--schema`
- **THEN** driver MUST 返回版本化 JSON envelope、action identity 与该 action 的 closed input JSON Schema
- **AND** schema 根对象的 properties MUST 与 Application 对同一 action 接受的顶层字段来自同一 contract

#### Scenario: 查看最小输入示例

- **WHEN** Agent 对一个受支持 action 请求 `--example`
- **THEN** driver MUST 返回版本化 JSON envelope与最小 `inputJson` 示例
- **AND** 无输入 action MUST返回空对象，含运行态占位值的示例 MUST 明确其仍需 current facts校验

#### Scenario: 普通 action 保持兼容

- **WHEN** Agent 不请求发现模式并执行任一现有 Task Development action
- **THEN** driver MUST继续要求 `--task` 与 `--target` 并返回原有 operation result或显式 profiling envelope
- **AND** Application、Development Receipt、Candidate、gate、decision与handoff语义 MUST保持不变

#### Scenario: 歧义或未知发现请求失败关闭

- **WHEN** 请求对未知 action 使用 action 级发现模式、缺少 action 请求 `--schema|--example`，或同时选择多个发现模式
- **THEN** driver MUST 返回usage error并以非零状态结束
- **AND** driver MUST不 compose runtime、不访问Workspace、不执行任何Task Development action
