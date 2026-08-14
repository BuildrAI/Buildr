## Why

Formal Task Verification 目前只对相同 invocation 的 active Execution Record 去重；已有 terminal record 时，未显式传入 `--retry` 仍会再次启动昂贵 capability 并创建新 run/record。这与 CLI 和 Task Verification Skill 表达的重试语义不一致，也使稳定 Content Target 的默认单次执行缺少 repository authority 保证。

## What Changes

- **BREAKING**：相同 invocation 已有 active 或 terminal Execution Record 时，默认复用 repository 中确定性选出的已有 record/result，零执行且不创建新 run/record。
- 保留 `--retry` 作为唯一显式创建同 invocation 独立 run/record 的入口；identity 输入变化仍按首次执行处理。
- 以 exact invocation identity 查询和稳定 latest 排序定义多条历史 record 的选择规则，并覆盖全部现有 outcome/lifecycle terminal 状态。
- 保持 Verification Result、Execution Record 与 Task Development 的现有 authority 边界，不迁移、不删除或覆盖历史 record。
- 同步 CLI help、Task Verification Skill/v3 contract、JSON/CLI 文档、current knowledge 及分层测试。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-verification`：将相同 invocation 的默认去重从 active record 扩展到 terminal record，并规范 exact/latest/retry 选择与零执行 readback。

## Impact

- Application：Verification runner 与 Task Execution Record open/query 协作。
- Persistence：SQLite exact invocation 查询和确定性排序；不改变 schema。
- Interfaces：`verification run --retry` help 与公开 execution envelope 的复用标识。
- Assets：Task Verification Skill、`buildr.task-verification/v3` contract、OpenSpec/current knowledge 和实现型文档。
- Tests：execution-record repository/application、verification integration、CLI、contract 与 OpenSpec strict validation。
