## 1. 来源模型与接入

- [x] 1.1 实现兼容的 Project/Service Managed Root、Attached Root Domain、manifest parser/renderer 与统一 source resolver，并用单元测试证明旧 v2 bytes、路径边界、Git identity 与重复 realpath 语义。
- [x] 1.2 为 Project/Service CLI 与 Application 增加只登记不改外部内容的 `--attach` 路径，迁移 Project/Service registry、detail、文档与 Git observation 到 resolver，并用外部 Git fixture 验证零内容副作用。

## 2. 下游来源消费

- [x] 2.1 将 Change/OpenSpec、Publication、Verification、Task Environment/worktree/Finish 和 Doctor scope 等生产 source consumer 收敛到 resolver；managed-only action 显式保留 inside/ownership guard，并补齐 focused integration tests。

## 3. 局部诊断与收敛

- [x] 3.1 扩展 Doctor finding 与 JSON result model，输出 domain、scope、affectedActions、ownershipUnit、domainHealth 及非许可型兼容 health；审计 `health.ready` consumer并补充分域反例测试。
- [x] 3.2 按 ownership unit 调整 Workspace sync、Capability route 与 Component conflict consumption，使可分离 optional/foreign-owner 问题不阻塞无关 unit，同时保留 required Core、共享 transaction、identity/integrity/path/delete 硬边界。

## 4. 验证与认知收敛

- [x] 4.1 运行 focused、affected 与适用完整验证，收敛 Brief、技术架构、Service knowledge 与 glossary，严格校验并收敛 OpenSpec Change。
