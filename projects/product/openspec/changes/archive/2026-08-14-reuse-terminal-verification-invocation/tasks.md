## 1. Execution Record 原子选择

- [x] 1.1 将 open 输入从仅允许active重复改为显式允许同invocation重复，并返回`opened|reused|existing-active|existing-terminal` closed status
- [x] 1.2 在SQLite transaction内实现exact identity、active优先及`opened_at DESC, record_id DESC` latest选择，并同步公开list稳定排序
- [x] 1.3 增加active、全部terminal lifecycle/outcome、多历史record、同时间戳、retry与identity变化的repository/Application测试

## 2. Verification 零执行复用

- [x] 2.1 在Verification Application消费`existing-terminal`并返回保留原outcome/lifecycle的非执行execution envelope
- [x] 2.2 保持active复用、显式retry、quota/backpressure、target observation、transient evidence与Verification Result authority边界
- [x] 2.3 增加terminal passed/failed/blocked/cancelled/attention、零process/resource/evidence副作用及CLI退出语义测试

## 3. Agent 契约与公开说明

- [x] 3.1 更新`verification run --retry` help、CLI reference与JSON contract说明
- [x] 3.2 更新Task Verification Skill与`buildr.task-verification/v3` contract，写清exact/latest/terminal/retry与authority边界
- [x] 3.3 更新contract tests与package/runtime source parity断言，不直接编辑Buildr生成的retained资产投影

## 4. OpenSpec 与当前认知

- [x] 4.1 更新Buildr Service current knowledge，替换“terminal history不阻塞”事实并说明cleaned/GC边界
- [x] 4.2 对照实现执行current knowledge reconcile/inspect，更新Brief与knowledge impact evidence并确认术语aligned
- [x] 4.3 核对proposal、design、delta spec、tasks与实际实现一致，完成Change checklist

## 5. 验证与收敛

- [x] 5.1 运行Execution Record、Verification、CLI/contract focused tests并记录真实耗时
- [x] 5.2 运行OpenSpec strict validation与Service affected直接验证；已有可靠证据不重复执行
- [x] 5.3 核对全部Change-owned artifacts、实现、知识与测试一致，达到deterministic convergence readiness
