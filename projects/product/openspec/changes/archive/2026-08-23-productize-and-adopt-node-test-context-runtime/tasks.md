## 1. TypeScript公共Runtime

- [x] 1.1 将Context definition、runtime、Node adapter与multi-Host runner迁移为strict TypeScript authority，补齐闭合泛型公共类型并保持现有运行时diagnostic。
- [x] 1.2 建立独立ESM/`.d.ts`生成与drift-check pipeline，更新package facade/exports/scripts并让根typecheck覆盖Runtime源码。
- [x] 1.3 增加JavaScript运行契约、strict NodeNext外部TypeScript consumer正反例和checkout生成物一致性测试。

## 2. Candidate package公共表面

- [x] 2.1 让唯一release artifact staging包含Test Context facade、生成ESM和`.d.ts`，保持CLI Application Payload与公共library边界独立。
- [x] 2.2 扩展tarball inventory、安装后ESM import、外部TypeScript consumer和checkout/package parity验证，拒绝raw Runtime TS与Buildr test-only资产。

## 3. Owner审计与迁移

- [x] 3.1 建立覆盖全部registry step的closed Context disposition authority与contract，记录`context-runtime|hybrid|full-lifecycle`、reason code和边界一致性。
- [x] 3.2 提供统一Buildr Context test adapter和Application/immutable Workspace provider组合，验证cache、隔离、descriptor恢复、dirty eviction与失败cleanup。
- [x] 3.3 迁移Task read models、coordination与Runtime/Application composition中全部eligible owner，移除matching case内重复Runtime/seed组装并完成focused正确性/timing。
- [x] 3.4 迁移Task execution records、Finish Application core与Environment repository/Application边界中全部eligible owner；跨CLI/Git/SQLite多连接case保持hybrid或full-lifecycle并完成focused正确性/timing。
- [x] 3.5 核对System Finish、自举、Workspace/Worktree lifecycle、onboarding/init、Candidate/Launcher/Host Node/Windows/Release等黄金owner仍保留最低充分primary evidence。

## 4. 控制面、证据与架构说明

- [x] 4.1 让executor与Execution Record聚合Host/Context/Pool阶段，稳定记录create、cache-hit、wait、body、reset、dirty/evict、materialize、cleanup与wall-clock。
- [x] 4.2 更新完整verification framework文档、owner接入清单与维护流程，并同步受影响technical architecture、Buildr Service说明和canonical术语。
- [x] 4.3 创建或刷新Brief与knowledge impact evidence，完成current-knowledge/terminology reconcile并消除本Change范围内的解释性漂移。

## 5. 直接验证反馈与收敛准备

- [x] 5.1 运行Runtime、类型、facade、registry、owner coverage与package focused验证，修复所有正确性、隔离和生成物漂移问题。
- [x] 5.2 在同一冻结tree运行迁移owner多轮、至少三轮无外部竞争Core及一次Core/affected竞争，记录中位数、波动、数学下限、残余长尾与180秒结论。
- [x] 5.3 核对Core/Candidate union、唯一primary owner、Release exclusions和黄金旅程不退化，完成OpenSpec strict/archive readiness检查。
