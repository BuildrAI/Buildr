# 试点迁移映射与验证清单

本文件记录 2026-08-24 对集鲜 live Workspace 的只读观察。迁移写入必须由 `/Users/chenjun/AI/jixian` 中各 Project 的正式 Task/Change authority执行；本 Product Change不修改该Workspace。

## Pig

- 当前只有 `pig-openspec.strict`，证明OpenSpec结构与语义，不证明生猪业务代码。
- 迁移：保留id；增加`evidence: [static]`、`usableFor: [task-delivery]`、将paths迁至`discovery.sources`，同一command作为full；没有可信affected入口。
- 结论：OpenSpec输入可选择该能力；生猪业务源码仍必须形成`project:pig`或精确path owner gap，不得以OpenSpec通过代替业务测试。

## FreshX

- `freshx-nm.unit/build`、`freshx-pigs.logistics-unit/build/evaluation-unit`均有真实mvnd入口。
- 迁移：unit能力使用`evidence: [unit]`，build使用`evidence: [static]`；均`usableFor: [task-delivery]`；现有paths迁入`discovery.sources`；聚焦unit命令可作为affected，模块级unit/build命令作为full。
- 验证：分别用NM、物流快照、评价源码路径生成affected Plan；模块构建配置或无法可信收窄的输入必须显式选择full。

## Foundation

- `base-upms.onboarding-unit/build`、`business-common.logistics-unit/build/evaluation-unit`均有真实mvnd入口。
- 迁移方式与FreshX一致；聚焦测试为affected，模块级test/package为full。
- FreshX依赖Foundation API/DTO或业务实现时，由调用方Request的显式可信dependency关系扩张Foundation capability，并在Plan记录`dependency`、trigger和parent；不能仅靠路径猜测跨Project DAG。

## 验收清单

1. 三个Project声明只剩`buildr.project-verification/v3`，Doctor无旧schema finding。
2. Pig业务路径产生gap；FreshX聚焦路径产生direct affected；Foundation跨Project关系产生dependency扩张。
3. 配置、owner authority或未知路径变化显式full或blocked，不返回空passed。
4. 正式执行使用matching Request/Plan，Execution Record绑定request/plan/declaration/execution unit identity；不同Plan不得混合reconcile。
5. 迁移完成后扫描live声明、Skills、templates和tests；除不可变archive provenance及明确旧schema拒绝诊断外，不存在旧版本authority。
