## MODIFIED Requirements

### Requirement: Task environment 必须核验 execution binding
Buildr MUST 以 environment receipt、repository membership/identity、allowed execution roots、environment-bound CLI source identity、可直接执行的绝对 CLI invocation、runtime projection identity 和明确 target/workdir 判断 `executionReady`。CLI invocation MUST 使用结构化的绝对 `command` 与固定 `argsPrefix`，并 MUST 与 receipt 中的 source、source kind 和 identity 一同核验。自举 Workspace MUST 使用 environment 内对应的产品 CLI bridge；没有产品源码成员的普通 Workspace MAY 使用 receipt 显式声明的 external-product CLI invocation，且不得假设产品位于 Workspace 的固定相对目录。Agent session root MUST NOT 是普通 proposal、implementation、verification 或 finish 的必要条件，也 MUST NOT 被要求等于 environment root。

#### Scenario: canonical workspace 对话操作 task environment
- **WHEN** Agent session 从 canonical Workspace 启动，并在 create 后使用 task environment 返回的明确 target、成员 checkout workdir 和 environment-local CLI invocation
- **THEN** context MUST 在 environment、repository、CLI source、CLI invocation 与 runtime identity 匹配时返回 `executionReady: true`
- **AND** invocation 的 `command` MUST 是 task checkout 内已有 Node-aware 产品入口的绝对路径，调用方从任意 cwd 执行时 MUST NOT 再拼装产品路径
- **AND** canonical Workspace 中已加载的能力 MUST NOT 因 session root 不同而失效

#### Scenario: 普通 Workspace 使用外部产品 CLI
- **WHEN** Buildr 产品源码不属于目标 Workspace repository set，receipt 已声明 external-product CLI source identity 和 invocation，且命令使用 environment target/workdir
- **THEN** context MAY 返回 `executionReady: true`
- **AND** result MUST 披露绝对 command、固定 args prefix、CLI source kind 与 `checkoutLocal: false`，不得伪装为 environment-local CLI 或假设产品目录位置

#### Scenario: 标准消费者执行产品命令
- **WHEN** Action Registry、验证框架或其他标准消费者需要运行 receipt-bound Buildr 命令
- **THEN** consumer MUST 使用 context 返回的 CLI invocation，并只追加自身子命令参数
- **AND** consumer MUST NOT 根据 cwd、`cliSource` 或 Workspace 内固定产品位置猜测命令

#### Scenario: 请求路径或 CLI 越界
- **WHEN** target/workdir 不属于 allowed execution roots，或当前 CLI source、invocation/runtime projection identity 不匹配 receipt 声明的 environment-bound binding
- **THEN** context MUST 返回 blocked 并 fail closed
- **AND** MUST 报告不匹配的 target、workdir、membership、CLI source kind、source identity 或 invocation

#### Scenario: runtime identity 漂移
- **WHEN** environment identity、repository plan 或 runtime projection identity 不再匹配 receipt
- **THEN** context MUST 返回 `stale` 或 `blocked`
- **AND** MUST 要求重新收敛 environment/runtime，而不是创建另一份纯 checkout

#### Scenario: 读取缺少 invocation 的旧 receipt
- **WHEN** 已有 receipt 仅包含 CLI source identity 而没有结构化 invocation
- **THEN** Buildr MUST 保持 receipt 可读，并根据已核验的当前产品生成 invocation
- **AND** 标准输出与后续安全 refresh MUST 使用新 invocation 契约，不得要求调用方继续猜路径
