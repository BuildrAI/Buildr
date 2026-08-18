## 1. Target lease coordination

- [x] 1.1 以连续SQLite migration允许matching terminal Finish row临时持有target lease，并覆盖旧数据迁移、过期terminal owner接管与token-fenced release测试
- [x] 1.2 扩展Task Finish repository/Application内部current-owner lease操作，保持普通deliver短lease与same-run可重入语义
- [x] 1.3 增加retained Product内部lease driver及schema/identity/零越权测试，不注册公共CLI或新capability contract

## 2. Delivery Adaptation 与 remote readback

- [x] 2.1 从current Task Environment Preparation Plan派生无secret、无Task worktree绝对路径的portable preparation hints
- [x] 2.2 在Delivery Adaptation required的canonical/compact Result加入blocked-only exact commit message与preparation guidance，并覆盖terminal/Execution Record隐私边界
- [x] 2.3 为Task Finish push后的remote readback实现固定小次数重试，覆盖暂态成功、持续失败、ref mismatch与不重复push

## 3. Self-bootstrap orchestration

- [x] 3.1 让workspace-only runner在activation副作用前获取/刷新/释放target lease，并覆盖complete、doctor-blocked、occupied、过期与resume后重新获取
- [x] 3.2 将proven foreign carrier改为isolated coexisting observations和精确untracked ignored roots，只让unprovable entry零副作用阻塞
- [x] 3.3 将latest target fast-forward与最多两次same-run target-race recovery前移到sync/安装/重启之前，删除foreign-clear特殊重试依赖
- [x] 3.4 为self-bootstrap push readback加入有限重试，并验证commit/push部分成功effects与幂等恢复
- [x] 3.5 更新`buildr-self-bootstrap-sync` Skill、Component contribution、integrity与用户npm package隔离断言

## 4. Knowledge and convergence

- [x] 4.1 按最终实现更新Change Brief、技术架构与Buildr Service current knowledge，并确认术语无需新增glossary
- [x] 4.2 运行OpenSpec strict validate、Buildr convergence preflight与受影响unit/integration/system/contract tests，修复全部current scope失败
- [x] 4.3 将Change artifacts与实现收敛为可归档状态并完成current knowledge inspect
