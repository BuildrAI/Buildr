# 收敛 Workspace 后端应用与模块边界

## 一句话摘要

在保持 Workspace、Project、Service 外部行为不变的前提下，以各层和各文件的真实职责边界为基础，只拆分职责混杂且体量过大的Workspace Application，并用受类型约束的私有组合替代进程级共享runtime注册。

## 背景与问题

Workspace 模块已经完成目录分层和 TypeScript 迁移，但 Repository、Application、Fence 与 Interface 仍把大量方法写入共享 runtime，模块再按字符串方法名重新挑选能力。该方式掩盖真实依赖，使只读 Query、writer 和跨模块消费边界难以通过类型与结构验证。

## 目标与非目标

目标是收敛 Workspace 后端的依赖方向、Application 职责和唯一模块组合入口。Project、Service 等当前体量合理的文件不为形式对称机械拆分。

本切片不改变 CLI、HTTP、JSON、YAML、Registry、错误或写入语义，也不处理 Project/Service 创建 CLI 大文件和 Buildr Web 页面；后两项由已登记子任务继续完成。

## 核心流程

Bootstrap 选择明确基础能力 → Workspace module 构造 Repository/Fence/Application → module 暴露稳定 Application/Query capability 与 Interface contribution → 其他模块只消费声明的窄端口。

## 关键变化

- Workspace Query与Command分开维护；Prompt和诊断按主要职责归入现有Application或具名私有协作者。
- Repository、Application与Fence使用明确Runtime type，只装配到模块私有组合。
- Project、Service保持领域独立和适合体量的Application文件，不机械拆Query/Command。
- `module.ts` 只负责依赖选择、构造、capability 与 contribution 组合。
- 现有 capability identity 和全部外部行为保持不变。

## 影响、风险与兼容性

影响 Buildr Service 的 Workspace 模块及其内部消费者。主要风险是能力方法遗漏、错误映射或调用顺序漂移；通过 capability surface 测试、结构验证和 Workspace/Project/Service 行为回归控制。本变更没有数据库或持久化格式迁移。

## 验收摘要

Workspace 后端不再向进程级共享runtime登记内部能力；Query不暴露writer；`module.ts`成为唯一私有组合入口；Workspace、Project、Service保持独立领域；文件只在职责与体量共同需要时拆分；现有CLI、HTTP、JSON、YAML、Registry、错误和写入结果保持兼容。

## 技术产物入口

- `proposal.md`
- `design.md`
- `specs/workspace-control-plane-module-architecture/spec.md`
- `specs/product-source-layout/spec.md`
- `tasks.md`
