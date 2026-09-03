## 1. 删除 Task Overview

- [x] 1.1 删除 Overview Application、Repository、module descriptor、runtime port、HTTP operation与bounded read mapping
- [x] 1.2 让 Buildr Web 从 Task detail展示真实目标与结果，删除Overview client、状态、请求和专属组件逻辑
- [x] 1.3 删除Overview专属测试和验证owner登记，保留Task detail及专业inspect覆盖

## 2. 收窄 Task Record

- [x] 2.1 从Domain、Application、CLI和HTTP schema删除`noChange`与Record内`childTaskIds`，删除无消费者的重复read字段
- [x] 2.2 强制update、activate、complete、abandon和复盘状态写入提交当前`recordDigest`
- [x] 2.3 让未来终态更正历史补全scope、Change与`isParent`，并收窄父任务completion snapshot
- [x] 2.4 修改self-bootstrap只以Task completed、Product scope、明确delivery ref和Git readback核验交付

## 3. SQLite与旧实现清理

- [x] 3.1 新增migration 0031重建`tasks`并删除`schema_version`、`result_no_change`和`terminal_contribution_reconciliations`
- [x] 3.2 删除无current消费者的Contribution Handoff/Planned Contribution实现与专属测试
- [x] 3.3 验证fresh数据库与真实0030副本升级后保留Task、关系、Review、Verification、legacy Parent Plan和retrospective事实

## 4. 接口、Web与术语

- [x] 4.1 将剩余Task professional response改为closed schema并从唯一源重新生成两端DTO
- [x] 4.2 统一父任务协调（Task Parent Coordination）术语，移除当前界面和CLI中的Environment/旧Finish/复盘来源残留文案
- [x] 4.3 保持`task-manager`及现有Skill capability结构不变，并在Change范围检查中证明没有Skill增删改名

## 5. 当前认知与验证

- [x] 5.1 收敛canonical specs、Product规则、current knowledge、架构、流程、Service说明和glossary
- [x] 5.2 运行TypeScript、Task单元/集成/系统、SQLite migration、HTTP contract与Buildr Web build/browser相关检查
- [x] 5.3 完成knowledge reconcile、全部checkbox，并通过OpenSpec strict及convergence preflight/converge
