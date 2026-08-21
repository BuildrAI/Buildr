## 1. 模块边界与装配

- [x] 1.1 建立 `src/agent-assets/module.mjs` 与模块架构测试，固定 Agent Assets 内部注册顺序和 Bootstrap 唯一安装入口
- [x] 1.2 将 Rule、Skill、Command、Component 和 runtime discovery Application 迁入 `agent-assets/application`
- [x] 1.3 将 Builtin/package maintenance 与 runtime projection Application 迁入 `agent-assets/application`，保持现有公开方法和 writer authority

## 2. Runtime Infrastructure 迁移

- [x] 2.1 将 runtime adapter、checker、projection、Rules render 与 Skill source/render/receipt 实现迁入 `agent-assets/infrastructure/runtime`
- [x] 2.2 原子更新生产源码、测试、工具和发布物消费者的全部旧 runtime imports
- [x] 2.3 退出 `legacy-runtime-module` 中已迁移职责的直接注册，并由 Bootstrap 显式安装 Agent Assets 模块

## 3. 集成与兼容验证

- [x] 3.1 更新 CLI/HTTP、Doctor、Application Payload、Verification owner 与架构边界测试，禁止旧生产路径和重复实现
- [x] 3.2 运行 Rule、Skill、Command、Component、Builtin、Capability Binding、render/sync/runtime focused tests 并修复结构迁移问题
- [x] 3.3 验证 typecheck、受影响集成测试、Application Payload 与 npm candidate tarball 的入口等价性

## 4. 当前知识与收敛准备

- [x] 4.1 更新 `docs/architecture/service-architecture.md`，记录 Agent Assets 实际目录、职责边界、迁移状态和保留的 deferred 决策
- [x] 4.2 对齐 Brief、技术架构和 Service current knowledge，完成术语检查且不产生无关 glossary 变更
- [x] 4.3 清理全部已迁移旧路径，运行 OpenSpec strict validation 和 convergence preflight，确认 Change 可确定性收敛
