# 闭合正式验证的超时、进程清理与故障诊断

## 摘要

让正式验证（Formal Verification）的每个command在声明式deadline内运行，只清理本次owned processes，并在卡住、取消或producer失联时从同一Execution Record准确说明最后阶段与恢复入口。

## 背景与问题

当前Product Candidate runner已有step timeout和owned descendant cleanup，但正式Task Verification通用executor仍无deadline、进程组、TERM→KILL和输出边界；Browser dispatcher也使用无timeout的同步子进程。失败路径因此可能长期等待、留下子进程或只形成缺少阶段事实的open record，迫使用户和Agent人工诊断或重复运行昂贵验证。

## 目标与非目标

目标是闭合v3 command deadline、owned process termination、Execution Record current progress、Browser phase/cleanup与Product资源声明。非目标是建设事件平台、通用scheduler、主机监控、自动retry、跨Candidate evidence复用或新的Verification Result authority。

## 受影响用户或角色

主要使用者是执行正式Task Verification、查看Execution Record或维护Buildr Product验证框架的智能体（Agent）和维护者。普通Buildr Workspace用户只会获得更可解释、更安全的验证失败与恢复行为，不承担内部进程诊断。

## 核心流程

Project declaration/高级provider形成带deadline的closed execution unit → Formal runner打开Execution Record并取得resource → owned process按phase执行并覆盖更新current progress → 正常完成、timeout或取消后有界回收 → terminal body seal并清除running progress → Agent按同一record inspect/recover或显式retry。

## 关键变化

- v3 command invocation可声明`timeoutMs`，旧v3缺失时使用保守默认，v2保持只读兼容。
- 正式executor复用owned process group、lineage、TERM→grace→KILL、stdio close与有界输出语义。
- open Execution Record只保存一份current progress snapshot，不保存事件历史。
- Browser dispatcher改为异步phase runner，Browser/server/Preview cleanup独立有界。
- `concurrent-task-acceptance`声明真实Task lifecycle与App runtime资源，Preview等待readiness而非固定10秒kill。

## 影响、风险与兼容性

新增nullable Execution Record progress需要SQLite migration，但旧rows无需backfill；顶层Execution Record outcome与显式retry规则保持兼容。默认deadline采用保守值，并允许v3按真实能力提高到上限。错误ownership可能伤及其他进程，因此实现必须以process group和observed lineage证明为前提，禁止端口或名称匹配。

## 验收摘要

正常command在deadline内保持原行为；忽略TERM的child会在grace后被KILL且留下timed-out诊断；外部同名进程不受影响；open record可回读current phase但不伪造terminal；Browser成功、phase timeout与cleanup failure都可定位；Full capacity和required coverage不变。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Tasks](tasks.md)
- [Delta Specs](specs/)
