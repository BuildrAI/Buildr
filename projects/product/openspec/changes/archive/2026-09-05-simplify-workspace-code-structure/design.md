## Context

现有代码已分层，但独立创建应用、策略辅助文件及部分前端Hook增加跳转成本。Workspace通配导出使内部方法暴露到共享运行时，边界仍不清晰。以当前Task Record具名仓储对象与显式端口作为参考。

## Goals / Non-Goals

目标：应用层从十个文件收缩到六个主要文件；Project/Service各自一个应用；来源技术能力分别由Git、文件系统和管理保护三个文件承载；前端按完整领域动作组件组织。
非目标：不改变公开协议、存储格式、权限和用户界面，不建立统一CRUD框架、全局Store或新依赖。

## Decisions

- Project/Service创建合并进所属应用，保留一个注册入口和明确仓储对象。小策略方法按归属并回对象或应用内部。
- Workspace保留Query/Command/Operations，不继续拆Guidance/Diagnostics等文件。CLI传入结构化参数，Operations返回结构化结果，通过事件通知保留初始化输出时序。
- source-root领域文件仅持有声明规则与稳定身份；本机目录解析、受限文档读取、复制及暂存清理进入workspace-source-filesystem.ts；Git clone进入现有workspace-source-git.ts。
- 每日演进日期选择与查询分组移入现有Application，Repository直接保存业务文档；不新增view/codec文件。
- module建立具名Repository对象和显式方法出口，跨模块读取优先消费Workspace Query；确有兼容消费者的低层方法逐项列明，避免骤然删除迁移与Doctor需要的能力。
- Workspace目录Hook并回页面，共享文档Hook移入lib。Drawer按领域粗拆完整表单；每个表单自己拥有状态和提交，公共结果展示与复制复用一个组件。AppLayout保持应用壳职责。
- 保留有界技术层平铺，文件内通过类型、私有方法和注释说明逻辑组；不为单个逻辑单元新增目录或文件。

## Risks / Trade-offs

- 运行时方法收窄可能遗漏动态调用 → 检查真实消费者并执行运行时、初始化、迁移和恢复测试。
- 文件操作迁移可能改变失败清理与路径保护 → 保留错误语义、事务范围和暂存策略，验证文件/Git隔离行为。
- 表单迁移可能改变参数、提示和DOM → 保留现有协议与稳定DOM，运行生产托管浏览器验证。
- 单文件包含多个用例 → 用对象方法和内部小节组织；达到维护压力后再按实际原因拆分。

## Migration Plan

先收缩后端应用与技术层，再收窄端口，最后调整前端和代码地图。最终进行适用验证、规范收敛与交付，无用户数据迁移。回滚使用普通代码提交。

## Open Questions

无。
