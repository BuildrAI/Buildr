## 1. 事实基线与结构迁移

- [x] 1.1 固定两个 Service、Product 治理、工程工具、测试、资源、构建、CI 与文档的当前文件和直接消费者清单
- [x] 1.2 迁移 Workspace 至 `src/modules/workspace`；更新全部消费者并通过 Workspace/Project/Service/Daily Progress 类型与最低行为检查后删除旧入口
- [x] 1.3 迁移 Task 至 `src/modules/task`；更新全部消费者并通过 Task Record/Review/Verification/Parent/Worktree 类型与最低行为检查后删除旧入口
- [x] 1.4 将通用 OpenSpec 从 Task 拆至 `src/modules/openspec`；Task 只保留 scoped Change 关联，并通过 strict/preflight/convergence/恢复测试后删除旧入口
- [x] 1.5 迁移 Installation、Diagnostics、Publication 与 Project Testing；逐模块更新消费者并通过各自契约/集成检查后删除 `src/system` 与含混 `src/verification`

## 2. 内部职责收敛

- [x] 2.1 迁移 Agent Assets 根与 Interfaces，保持公开 Rule/Skill/Command/Component/Builtin/runtime CLI/HTTP 契约
- [x] 2.2 将 Command、Rule 与 Skill 的业务规则和 Manifest 持久化从大 Application 中分离，并通过 add/remove/check/render 最低测试后删除旧内联实现
- [x] 2.3 将 Component/Builtin 的成员规则、Manifest/receipt、source transaction 与 runtime reconcile 分离，并通过原子性、ownership、partial effects 与恢复测试后删除旧内联实现
- [x] 2.4 将 capability graph/binding 从投射技术目录迁入 Domain/Application owner，并通过 capability route、冲突与 adapter parity 检查后删除旧入口
- [x] 2.5 拆分通用 filesystem 聚合，把 Workspace、Rule、参数与诊断业务职责迁回所属 owner；通过锁、原子写入、mutation、CAS 与恢复测试后删除聚合注册桥
- [x] 2.6 用具名模块 capability 和 contribution 替代共享 runtime 业务方法注入；逐个更新 Bootstrap、CLI、HTTP、Diagnostics 与测试端口，只有所有调用者通过类型和最低行为检查才删除方法目录
- [x] 2.7 将业务诊断归一化下沉至所属模块，并把公共 Web Router 的业务路径/参数特判迁入对应 HTTP contribution

## 3. 工程、资源与前端

- [x] 3.1 将 `tools/contracts` 迁入 `tools/codegen/contracts`，同步 package scripts、生成输出、消费者、验证声明与 CI
- [x] 3.2 将 Launcher 工程源码迁入 `tools/build/launcher`、runtime Skill 源迁入 `resources/runtime`，更新资源清单、npm 打包、Application Payload、候选构建和旧兼容入口
- [x] 3.3 保留 `test-context.mjs` 公共 facade、`src/infrastructure/testing/context-runtime` source 与 ignored `package/targets/test-context` generated output 的三层边界，验证 ESM import、matching types、tarball consumer 与无 test/provider 依赖
- [x] 3.4 核对 `package.json` `./*` 兼容 export 与唯一稳定 `./test-context` facade；不为旧内部源码路径建立转发，并以 package metadata、文档和 Candidate 检查证明边界
- [x] 3.5 按声明管理、任务验证报告、Buildr 自测工程和实际用例整理测试责任及路径引用，不新增完整项目测试生命周期能力
- [x] 3.6 将 Buildr Web 的 Publication、Installation 和 Task-scoped Change 页面/客户端归入对应 feature，删除无用页面并保持路由、DOM 与同源托管兼容

## 4. 规范、知识与地图

- [x] 4.1 更新受影响 OpenSpec delta、项目声明、Service 架构说明、维护文档和导航，使所有路径与职责引用最终实现
- [x] 4.2 建立 `knowledge/code-map` 四层全项目代码地图，登记真实模块、主要对象、代表方法、调用、数据、资源与副作用
- [x] 4.3 使用 Archify 更新系统全景并交付关键调用/数据责任技术图，完成 showcase validation、deliver、桌面视觉检查与导航互链
- [x] 4.4 完成术语治理与当前认知 reconcile，消除规范、实现、登记、代码地图和技术图的冲突

## 5. 实现验证

- [x] 5.1 运行 OpenSpec strict validation 与 convergence preflight，并处理全部语义或 active Change 冲突
- [x] 5.2 运行代码生成检查、TypeScript typecheck、架构/包边界、单元、组件与契约测试
- [x] 5.3 运行受影响的 Workspace、Task、Agent Assets、OpenSpec、Installation、Diagnostics、Web Host、锁/事务/恢复集成和系统测试
- [x] 5.4 构建 Buildr Web 并运行前端测试、生产托管 Browser smoke、Application Payload 与 npm pack/candidate 检查
- [x] 5.5 核对旧路径、重复实现、断裂引用、tracked 生成物、Git dirty 与完整交付 diff，并记录正式 Task Verification 结果
