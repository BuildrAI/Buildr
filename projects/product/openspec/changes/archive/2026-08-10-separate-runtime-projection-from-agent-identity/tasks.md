## 1. 产品入口 Skill

- [x] 1.1 精简 Buildr Skill 源正文，加入宿主身份 authority、显式目标和禁止投射推断边界
- [x] 1.2 删除 renderer 的 adapter 身份与固定命令注入，保持所有 adapter 的执行正文中立
- [x] 1.3 更新 bootstrap package contract，要求中立身份边界并拒绝旧身份声明

## 2. 契约与当前认知

- [x] 2.1 更新 Buildr Skill 系统架构、runtime adapter 文档和 Project 技术架构
- [x] 2.2 收敛 Brief、knowledge impact 与术语检查，确保没有新增或歧义 canonical term

## 3. 验证与收敛

- [x] 3.1 增加所有 supported adapters 的产品 Skill 中立性、内容一致性和 package contract 回归测试
- [x] 3.2 运行聚焦测试、package check、OpenSpec strict validation 与 Product Quick/affected 直接反馈
- [x] 3.3 完成 Change convergence/archive readiness，确认 Qoder 场景只能从宿主身份选择 `qoder`
