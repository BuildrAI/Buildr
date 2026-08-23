## 1. Registry 与计划语义

- [x] 1.1 在唯一 verification registry 中增加 `core` profile、显式 Candidate-only exclusion authority 与集合闭合校验
- [x] 1.2 让 changed Full 展开 core graph，并使用独立、数学可行的 core 总预算

## 2. 执行入口与能力声明

- [x] 2.1 增加复用现有 DAG executor 的 `test:core` 入口，保持 `test:candidate` 默认行为与完整集合不变
- [x] 2.2 将 `product.full-regression` 切换到 core，并新增显式完整 `product.candidate` capability

## 3. 回归保护与当前认知

- [x] 3.1 补齐 registry、planner、CLI 与 declaration 契约测试，证明 core/candidate 边界和 Candidate CI/publish 唯一证据链
- [x] 3.2 更新 verification ownership 文档、Buildr Service current knowledge 与 knowledge impact evidence
