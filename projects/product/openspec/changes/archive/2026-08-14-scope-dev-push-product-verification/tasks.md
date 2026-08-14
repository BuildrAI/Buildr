## 1. Hosted CI 触发边界

- [x] 1.1 删除 `Verify Buildr` 的 `dev` push 事件，并把 Development feedback 收窄为仅处理目标为 `dev` 的 pull request。
- [x] 1.2 保持手工完整 Candidate、`dev → main` Candidate 与 tag publish 触发条件不变。

## 2. 契约与当前认知

- [x] 2.1 扩展 workflow 契约测试，结构化断言 `Verify Buildr` 的事件集合、Development feedback 条件和 Candidate 条件。
- [x] 2.2 更新 Buildr verification ownership 当前认知，说明 Formal Finish、PR hosted feedback、Candidate 与 Release 的验证责任。

## 3. 直接验证反馈

- [x] 3.1 运行受影响 workflow 契约测试与 OpenSpec strict validation。
- [x] 3.2 运行 `test:changed` affected plan，确认 workflow、规范、知识和测试修改均有明确 owner 且通过。
