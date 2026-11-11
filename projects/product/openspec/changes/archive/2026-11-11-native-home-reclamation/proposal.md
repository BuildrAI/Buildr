## Why

当前存储测量显示，Codex 与 DSH 的原生会话正文是 Buildr 对话存储之外最大的单一增长项：Codex 各模型绑定累计约 937 MB 会话文件，DSH 约 105 MB 会话目录，而自动维护按既有规范 MUST NOT 删除原生会话，也没有任何显式操作入口。结果是每个账号×模型×对话绑定的原生 home 只增不减，即使对话已结束、工具正文只依赖少量仍被引用的会话。

Buildr 自身保存可见消息、执行状态和工具引用；原生会话只在工具详情读取、结果核对和交接来源中承担证据职责。因此可以在**完整证明无任何引用**后回收未被使用的原生会话对象，同时保持自动维护永不删除原生会话的既有边界。

## What Changes

- 新增显式运维入口（buildr-agent 维护工具）：默认 dry-run 逐项报告候选（提供者、绑定、原生会话身份、大小、保留理由与总收益），只有 `--confirm` 才执行实际删除。
- 候选范围限定为单个原生会话对象：Codex `codex-home/sessions/**/rollout-*.jsonl` 文件与 DSH `dsh-home/sessions/<workspace>/session-<uuid>/` 目录。账号、凭据、配置、状态库、插件、附件、Qoder 账号目录与整个绑定 home 永不成为候选。
- 回收前必须取得完整引用证明：全部对话头（当前与历史参与者、全部尝试）、全部原生工具内容记录（v3 配置与上下文，以及旧 v1/v2 来源路径）与全部交接来源索引。任一来源不可读、绑定身份无法解析或引用缺失上下文时，保守保留受影响提供者或绑定。
- 执行沿用既有条件回收链路：24 小时稳定窗口、系统占用观察、删除前后身份复核、分批与预算；自动维护 worker 的周期性计划永不包含原生会话，任何未显式确认的调用保留全部对象。
- 不在本次范围：按绑定整体删除、插件重复副本去重、Qoder 保护日志清理、数据库 VACUUM、运行对象或环境缓存策略调整。

## Capabilities

### Modified Capabilities

- `agent-storage-lifecycle`：新增“原生会话只能由显式操作、在完整引用证明后回收”的要求，并明确自动维护仍 MUST NOT 删除原生会话。

## Impact

- `services/buildr-agent/src/storage/`：新增原生会话候选枚举与批量回收；`files.ts` 增加 `native-session` 候选类型与受控批量。
- `services/buildr-agent/src/application/`：新增引用清单（对话头、工具引用、交接索引）并接入维护计划与执行门禁。
- `services/buildr-agent/src/persistence/`：只读查询全部对话头的原生引用与全部原生工具内容引用。
- `services/buildr-agent/tools/maintenance/`：新增 dry-run/确认执行工具；不改动宿主 CLI 或网页入口。
- `services/buildr-agent/test/integration/`：覆盖引用保留、未确认保留、确认删除、旧编码与交接引用、未解析绑定、活动占用与身份漂移。
- 当前知识：实施后校准 `knowledge/docs/architecture/` 中智能体存储生命周期说明与运维入口；不改变账号、凭据、原生会话来源或用户对话读取路径。
