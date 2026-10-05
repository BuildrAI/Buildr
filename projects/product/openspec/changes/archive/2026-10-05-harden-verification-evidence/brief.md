# 交付证据收敛

本变更（Change）使主包候选检查（Candidate Gate）实际验证已声明的前端逻辑与唯一压缩包的核心页面交互，修复 `main` 作业跳过问题，同时保持 DSH 独立验证与发布边界。

整体目标和授权见[任务说明](@task/audit-foundation-boundaries)。本变更不承载同任务 SQLite 实现修正的第二份说明。

当前知识（Current Knowledge）影响：维护 `projects/product/knowledge/docs/architecture/verification-framework.md`、`projects/product/knowledge/code-map/product-verification-tools.md` 及确实引用候选集合的发布解释；现有关系未改变，无需新增技术图（Technical Diagram）或术语（Terminology）定义。测试声明由 `projects/product/verification.yml` 承担，源码与唯一候选压缩包（Candidate Tarball）的证据边界分别说明。
