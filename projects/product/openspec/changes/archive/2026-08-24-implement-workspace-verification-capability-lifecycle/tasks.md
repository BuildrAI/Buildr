## 1. v3 声明与诊断

- [x] 1.1 实现 closed `buildr.project-verification/v3` parser、normalizer 与 validator，覆盖能力族 scope、proves、evidence、usableFor、discovery、affected/full/provider invocation、准备、环境、副作用和资源边界
- [x] 1.2 更新 Doctor/diagnostics 只接受 v3，并为 v2 或未知字段返回执行前 migration finding，不保留兼容 reader
- [x] 1.3 增加 v3 contract/unit/integration fixtures，证明合法能力族可读、非法/越界声明失败且 v2 明确 invalid

## 2. Request、Plan 与执行对账

- [x] 2.1 实现 closed、内容寻址 Verification Request 与 Plan 数据模型及 identity，分离 target、scope、changed paths/risks、selected items、selection trace、full reasons 与 coverage gaps
- [x] 2.2 实现普通 Workspace planner：按 Project/Service/discovery 选择 affected/full，记录 direct/dependency/full reason，并让 unknown owner 或不可信收窄失败关闭
- [x] 2.3 扩展 execution admission、Task Execution Record 与 reconciliation，绑定 matching request/plan/declaration/execution unit，同时保持 Result、资源、清理和 current writer authority
- [x] 2.4 更新 CLI/Application read model，提供 plan preview 与 plan-driven run/record 路径，拒绝 preview 充当 evidence、stale plan 与重复启动

## 3. Buildr Product 高级 provider

- [x] 3.1 实现 Product registry/planner adapter，把内部 step/DAG/profile/resource/Context authority投射为closed公共Plan与execution units
- [x] 3.2 验证 Product affected、full、Product Artifact Candidate和Published Release对象/新增证据保持分离，provider identity漂移使旧Plan stale
- [x] 3.3 增加provider contract、selection trace、dependency expansion、full reason、owner gap与Execution Record matching测试，拒绝内部DAG泄漏

## 4. Skills、包资产与 Product live 迁移

- [x] 4.1 迁移 `projects/product/verification.yml` 到v3，按真实registry与入口声明能力族、证据、目标、discovery和affected/full/provider边界
- [x] 4.2 更新 `project-testing`、`declaration-intake`、`task-verification` Skills及v3 template/reference，删除v2 reference和双版本指导
- [x] 4.3 更新package manifest/static validation/runtime投射与CLI文档，保证只交付v3声明、Plan/provider资料并拒绝active v2资产
- [x] 4.4 迁移所有Product active测试fixture与browser/system journey，覆盖v3 schema、Plan执行和破坏性v2诊断

## 5. 试点与一次性迁移证据

- [x] 5.1 用隔离fixture证明Pig无测试形成gap、FreshX affected/full、Foundation跨Project依赖扩张和unknown owner fail closed
- [x] 5.2 为集鲜Pig、FreshX、Foundation生成基于当前live声明/构建事实的精确v3迁移映射和验证清单，供各自正式Workspace authority执行，不直接越界写入
- [x] 5.3 用Buildr自举Workspace和Product高级provider验证普通声明与provider两条路径，记录Request→Plan→Execution Record→Result authority链
- [x] 5.4 扫描除archive provenance外的active runtime、canonical specs/docs、Skills、templates与tests，删除全部`buildr.project-verification/v2`支持和过时兼容表述

## 6. Current knowledge 与实现反馈

- [x] 6.1 更新Change Brief、knowledge impact、glossary、roadmap和适用产品/架构文档，使其反映单版本v3、Plan/provider边界及跨Workspace迁移责任
- [x] 6.2 运行受影响contract/unit/integration/system测试与package static validation，修复实现反馈并保存可复核的选择/执行证据
- [x] 6.3 在收敛前重新核对canonical specs、实现、registries、Brief、current knowledge与术语，确保无阻塞冲突或未决v2 active authority
