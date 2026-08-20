## 1. Writer provenance

- [x] 1.1 将resource payload root与实际writer controller source identity分离，并让Workspace SQLite唯一写边界只消费后者
- [x] 1.2 增加candidate借installed payload identity写canonical store仍在零effect前被拒绝的单元/集成测试

## 2. Bundled internal workflow routes

- [x] 2.1 把Task Retrospective与Task Planning Identity重构为可打包runner并接入统一`__internal` CLI路由
- [x] 2.2 更新全部受管Skills/sidebars，改为消费matching retained controller invocation并清除source-only driver依赖
- [x] 2.3 建立required internal workflow route inventory，并接入package static validation与Doctor只读诊断
- [x] 2.4 扩展npm installed-layout tests，独立启动全部route并覆盖Retrospective writer与Planning Identity reader真实fixture

## 3. Portable diagnostics

- [x] 3.1 将Verification公共JSON checks收敛为portable摘要，完整stdout/stderr只写Execution Record并补回归测试
- [x] 3.2 为Task Verification unknown target/declarations axes返回稳定reason并补Application/contract测试

## 4. Current knowledge and verification

- [x] 4.1 更新Buildr technical architecture、Service current knowledge、Brief与knowledge impact evidence
- [x] 4.2 运行writer、internal route、Verification与Task Verification聚焦测试并修复失败
- [x] 4.3 运行package/static、npm artifact、Doctor和Project affected verification
- [x] 4.4 完成strict OpenSpec validation、semantic readiness复核与current knowledge inspect，确保Change可确定性收敛
