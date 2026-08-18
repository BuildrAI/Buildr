## 1. Product 稳定投影契约

- [x] 1.1 定义 `buildr.task-finish-self-bootstrap-input/v1` schema、closed field validation 与 v2/v3 canonical Result projector
- [x] 1.2 为 `task finish run|inspect` 增加 `--detail self-bootstrap` 参数、help、public JSON registry 与 checkout/npm parity coverage

## 2. Self-bootstrap runner 解耦

- [x] 2.1 将 current inspect、foreign inspect 和全部 resume 调用切换为 stable self-bootstrap projection，删除 raw Result major 分支
- [x] 2.2 实现 Workspace repository 选择、not-applicable 处置、run container 与全部 repository carrier 的严格 ownership/path 验证
- [x] 2.3 更新 Skill contract，明确 Product projection ownership、未来 major 演进与零副作用 fail-closed 边界

## 3. 自动验证

- [x] 3.1 补充 v2/v3 归一化、同 major additive field、未知投影 major 与不完整内部 Result 的 projector/unit tests
- [x] 3.2 补充 multi-repository Workspace/Service 选择、nested/escaped/duplicate carrier、foreign run 与 resume journey 集成测试
- [x] 3.3 运行受影响 static/unit/integration/system 与 package verification，修复所有本变更引入的失败

## 4. 认知与收敛

- [x] 4.1 更新 Buildr current knowledge 中公开 JSON 与 self-bootstrap boundary，确认无需术语表变更
- [x] 4.2 严格校验 OpenSpec change，并收敛实现、测试、知识与任务清单一致性
