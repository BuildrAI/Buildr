## 1. SQLite schema 与升级

- [x] 1.1 新增连续 migration，为 Development、Review、Verification current rows建立保存观察/查询字段并安全回填既有专业 payload。
- [x] 1.2 在 migration 中以专业 authority处理部分Lifecycle与Environment冲突，核验全部 terminal association可由Finish completion证明，最后删除`task_lifecycle_current`。
- [x] 1.3 扩展Workspace Store/Doctor/package schema检查，动态识别latest migration与退役后的表、索引和checksum边界。

## 2. 专业 current writer 与 reader

- [x] 2.1 重构Development repository/Application，让Receipt与正式applicability observation同事务保存，inspect只读保存事实。
- [x] 2.2 重构Review与Verification repository/Application，原子保存target/outcome/time查询字段，并只对显式保存identity做无副作用匹配。
- [x] 2.3 重构Environment、Task Record与Finish写入链，删除全部`projectTaskLifecycle*`调用和Lifecycle失败分支。
- [x] 2.4 重构Terminal Delivery直接消费Finish run/completion association，并保留delivered、noChange、completed-unproven与active cleanup语义。

## 3. Task Overview 与 Local App

- [x] 3.1 新增Task Overview repository/Application，以一条参数化SQLite联表查询组合Task和各专业最小current摘要。
- [x] 3.2 接入Local App Overview只读API与页面摘要；研发、证据、环境页继续消费所属专业reader且GET保持no-store/零观察/零写入。
- [x] 3.3 删除Lifecycle repository/Application、runtime composition、Finish runtime refresh、source/package映射与公开/内部残留引用。

## 4. 验证与兼容

- [x] 4.1 覆盖fresh、各旧ledger起点、完整/部分Lifecycle、Environment权威冲突、terminal association缺失/不匹配与migration fault rollback。
- [x] 4.2 覆盖Development原子观察、Review/Verification查询字段一致性、Overview单查询/缺失语义、专业inspect零外部观察与terminal association。
- [x] 4.3 更新package residual/static/contract/system/browser验证，证明checkout、初始化Workspace、npm tarball与Local App parity，且旧runtime对新库fail closed。

## 5. 当前认知与变更就绪

- [x] 5.1 更新受影响的任务生命周期架构、Service说明与Change Brief，完成术语和authority一致性核对。
- [x] 5.2 运行changed实现反馈、OpenSpec strict validation和适用的专项测试，修复全部本Change缺陷并确认无Lifecycle可执行残留。
