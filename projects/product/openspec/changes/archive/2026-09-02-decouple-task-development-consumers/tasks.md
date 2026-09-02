## 1. 数据与任务入口

- [x] 1.1 新增连续 SQLite migration，将有效旧 Parent Plan 复制到 Task-owned `legacy_parent_plan_json` 并覆盖迁移完整性测试
- [x] 1.2 切换 Parent context reader 到 Task-owned 历史列，删除 Development current fallback 与退役写入口
- [x] 1.3 删除 Task Entry Snapshot module、`task next` CLI、capability routing 和专属测试
- [x] 1.4 更新 OpenSpec、Triage、Development 等随包 Skills，使专业动作不再依赖 `task next`

## 2. 独立 read models

- [x] 2.1 收窄 Task Overview，删除 gate match、Development attention 和 Candidate/Handoff 完成推断
- [x] 2.2 收窄 Terminal Delivery，使其只读取 Task Record 与 Finish history并隔离历史损坏
- [x] 2.3 让 Review、Development、Verification HTTP GET 分别调用所属 Application，不包装 Terminal projection
- [x] 2.4 删除无消费者的 terminal association、snapshot 与旧恢复连接代码

## 3. Buildr Web

- [x] 3.1 调整任务详情和成果摘要，分别展示 Task、Review、Verification、Development、Environment 与历史交付事实
- [x] 3.2 删除 gate/adoption/统一下一步文案和后端专业 prompt 依赖
- [x] 3.3 保持无 Development、历史部分损坏和窄屏场景可用

## 4. TypeScript 与测试

- [x] 4.1 将保留且修改的实现、测试、fixture 与 helper迁移为TypeScript单一人工源码，删除确定退役的MJS及专属测试
- [x] 4.2 增加无Development任务、旧Parent历史迁移、Review独立读取、Terminal历史隔离和并发读取场景
- [x] 4.3 更新module architecture、package/static validation、ownership、test registry与typecheck覆盖
- [x] 4.4 运行受影响Unit、Component、Integration、System和Buildr Web Browser验证并修复回归

## 5. 当前认知与收敛准备

- [x] 5.1 更新任务系统依赖图、产品/技术架构、Buildr Service、Buildr Web和相关术语说明
- [x] 5.2 核对canonical specs、实现、Brief和当前认知一致，完成严格OpenSpec与package静态检查
- [x] 5.3 确认所有Change-owned任务已完成且没有归档后生命周期动作，准备确定性convergence/archive
