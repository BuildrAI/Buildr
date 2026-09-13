---
name: openspec-contract-guard
description: 使用 OpenSpec 时核对相关变更冲突、明确归档范围或检查中断恢复现场；只补充上游未覆盖的 Buildr 边界。
metadata:
  author: buildr
  version: "2.0"
  supportedOpenSpec: "1.13.0"
---

# OpenSpec 接入保护

标准规范解析、重建、正常写入及归档由已验证的 OpenSpec 1.13.0 安装负责。Buildr 只组合真实工作根与版本检查、相关变更冲突和必要中断恢复；不修改上游技能（Skill）正文。

## 只读检查

在当前工作空间（Workspace）或已核对的工作树（Worktree）中运行：

```text
buildr openspec convergence preflight <change> --project <project> --target <actual-work-root> --json
```

检查当前变更及相关规范条目是否被其他进行中变更修改。可证明无关的损坏内容只形成提醒；无法判断影响范围时报告最小缺口。ready 只对应本次观察，不是后续写入授权，不要求复制全项目执行隔离验证。

## 按请求范围执行

- 实现：根据已授权目标修改代码与当前变更材料，按需要调用相关检查。
- 只同步：执行上游 openspec-sync-specs，更新正式规范并保留变更。不调用 converge。
- 归档：确认当前变更任务完成且归档属于用户目标后，调用 `buildr openspec converge <change> --project <project> --target <actual-work-root> --json`。该命令使用上游完整规范写入和归档流程；只有恢复现场已经证明规范全部写入时才跳过重复规范写入。

不因阶段转换重复运行完整验证。上游命令保护与智能体直接编辑的保证不同，报告必须对应真实路径。

## 失败与恢复

`buildr openspec convergence inspect <change> --project <project> --target <actual-work-root> --json` 只读检查仍存在的恢复记录与真实文件。进程中断后复用同一操作与已观察输入；全部规范已经写入时只继续归档。混合状态、输入变化或并发修改不能安全证明时返回 recovery-unprovable，保留文件及记录，不自动回滚他人修改。

旧格式恢复材料保留并报告明确诊断；不把旧记录当作新写入授权。归档成立但记录释放失败时只处理释放，不重新同步。既有交付事实不因恢复或清理失败被撤销。

报告实际动作、状态、效果与必要下一步，不把内部过程记录当作长期产品事实。
