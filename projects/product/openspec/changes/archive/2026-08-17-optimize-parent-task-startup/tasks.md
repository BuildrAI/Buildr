## 1. Parent启动投影

- [x] 1.1 为Parent Coordination增加response-only startup readiness、checks、blockers、eligible Contributions和next派生逻辑
- [x] 1.2 覆盖ready、Review未消费、依赖未满足、unproven dependency、legacy Parent和零写入测试

## 2. Planning Review安全消费

- [x] 2.1 增加只复用saved Parent Plan、planning snapshot与current Review的Development refresh Application动作
- [x] 2.2 公开`task parent refresh-planning` CLI并覆盖identity drift、changes-required与candidate writer provenance
- [x] 2.3 为Parent Plan record/reconcile增加closed schema/example发现并与Domain validation保持一致

## 3. Parent-aware Task Entry

- [x] 3.1 在Task Entry只对current Parent Plan装配Parent startup reader并覆盖通用Development recommendation
- [x] 3.2 覆盖planning-review、refresh-parent-planning、start-child-contribution、dependency blocker与普通Task无额外读取

## 4. JSON、package与Agent workflow

- [x] 4.1 更新public JSON registry、contract guard、CLI registry/help和checkout/npm parity fixtures
- [x] 4.2 更新内置task-triage与task-development guidance，固定coordination-only Environment、refresh和Child前停止条件
- [x] 4.3 更新package/runtime source mappings及相关静态资产验证

## 5. 当前认知与直接验证

- [x] 5.1 更新Buildr Service current knowledge、架构/流程说明、术语影响与Change Brief
- [x] 5.2 运行OpenSpec strict validation、semantic readiness preflight及受影响的unit/integration/system/package验证
- [x] 5.3 修复直接验证反馈并确认Change满足deterministic convergence/archive前置条件
