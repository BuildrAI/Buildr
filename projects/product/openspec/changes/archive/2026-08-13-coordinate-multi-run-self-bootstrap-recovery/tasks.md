## 1. 只读恢复事实模型

- [x] 1.1 在 bundled runner 中实现固定 carrier 根的有界直接子项发现、真实目录与 symlink/containment/duplicate realpath 检查
- [x] 1.2 实现 foreign Finish Result 的 closed owner/Workspace/path/carrier/resume identity 核验与 `cleanup_pending | manual-owner-review | unprovable` 分类
- [x] 1.3 生成 ephemeral `buildr.self-bootstrap-recovery-plan/v1`，确定性排列原 owner cleanup 与当前 runner 重试，并明确授权、command 和预期 effects

## 2. Runner 集成与安全停止

- [x] 2.1 让 command adapter 通过现有 retained Product `task finish inspect --detail full` 读取全部候选 run，不导入 Product Application
- [x] 2.2 在 single-run preflight 前消费 recovery plan：存在任意 foreign carrier 时返回结构化 blocked Result，保持 sync、Git、安装、Doctor、Finish resume 与 carrier mutation 零副作用
- [x] 2.3 保持无 foreign carrier、普通 complete、doctor-blocked 与现有幂等 successor 路径兼容

## 3. 测试与文档

- [x] 3.1 增加多个合法 cleanup predecessor、清理后当前重试与确定性排序的 integration tests
- [x] 3.2 增加 unknown run、inspect失败、symlink、路径/Workspace/carrier/token漂移和不支持状态的 fail-closed tests
- [x] 3.3 更新 self-bootstrap Skill 与 contract tests，说明只读协调、原 owner action、授权边界和不新增 authority

## 4. 当前认知与收敛准备

- [x] 4.1 更新 Buildr technical architecture 与 Service current knowledge，记录 multi-run preflight 和无跨 owner mutation边界
- [x] 4.2 执行聚焦 static/unit/integration 回归、OpenSpec strict validation 与 current knowledge/terminology reconcile，并修复发现的问题
