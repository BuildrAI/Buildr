## 1. Fast admission 内容闭合

- [x] 1.1 建立测试侧 HTTP contract Fresh Build inventory，并让现有 generator/Schema/Buildr DTO/Buildr Web DTO 路径由同一 inventory 闭合。
- [x] 1.2 让 Contract/Static owner 校验 inventory、两端生成输出与 Fresh Build 消费关系，并接入现有 Fast admission，不新增验证阶段或跨调用缓存。
- [x] 1.3 更新 Fresh Build System fixture 消费闭合 inventory，保留真实 npm-ci、build:web 与最小源码边界。

## 2. Delivery Adaptation 路径覆盖

- [x] 2.1 在 Task Finish Git contribution 模块派生完整 Task Contribution 路径集合及 `target-contained`、`carrier-changed`、`agent-reviewed-target` closed coverage value。
- [x] 2.2 为 current run resume 增加一次性逐路径 Agent review 输入，校验未知路径、重复处置、空理由、run/resume/target/carrier identity 漂移并保持失败零写入。
- [x] 2.3 在 carrier adoption 与复核中要求 coverage 精确闭合，生成稳定 coverage identity 与紧凑缺失路径诊断，同时保留现有 Agent-reviewed semantic boundary。

## 3. Delivery、cleanup 与公共契约

- [x] 3.1 让 deliver remote readback、Delivery proof 与 Environment cleanup proof 重验同一 coverage identity，旧 proof 保持历史只读且不回填。
- [x] 3.2 更新 Task Finish CLI/help、公共 JSON 与 Skill/contract 边界，只暴露必要的分类计数、稳定 identity、缺失路径和恢复方向。
- [x] 3.3 保持 PR、直接 Git 与 Delivery Reconciliation 替代路径，不把自动 Finish blocker 扩大为通用工作许可层。

## 4. 回归与收敛准备

- [x] 4.1 增加“HTTP 契约文件未进入 Fresh Build inventory”回归，证明 Fast admission 阻止尚未启动的重型步骤。
- [x] 4.2 增加“35 个 Task Contribution 路径仅交付 2 个冲突路径”、逐路径 Agent review、zero-delta、proof drift 与 direct reconciliation 回归。
- [x] 4.3 运行 focused Contract/Integration/System 测试和适用 affected feedback，核对没有引入正式 Verification runtime、数据库或通用状态机语义。
- [x] 4.4 完成 Brief/current knowledge/术语收敛与 OpenSpec strict validation，确保 Change 达到 deterministic convergence readiness。
