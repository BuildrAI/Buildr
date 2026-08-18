# 发布版与开发版 Buildr Web 本机隔离并存

## 一句话摘要

让 npm/released 与 checkout-backed development 使用各自的普通 Buildr Web Root、实例和 Workspace registry，并在任何 Workspace SQLite 打开或 migration 前阻止同一真实 Workspace 被两个channel管理。

## 背景与问题

当前两种Launcher虽已有不同名称、安装身份和runtime role，普通Web仍共享`~/Library/Application Support/Buildr`中的`instance.json`、启动锁和registry。Development Buildr曾由此打开集鲜Workspace并把其SQLite升级到migration 16，随后发布版`0.1.0-rc.18`因只认识migration 15而fail closed。

## 目标与非目标

目标是按正式product identity解析released/development Web profile，允许两个loopback Server并存，隔离registry，并建立跨registry与Workspace-local的migration前fence。发布版Root和已有registry保持原位，Development Launcher无需用户设置环境变量。

本次不降级或改写任何SQLite，不修改集鲜Workspace，不自动转移ownership，不提供force，不引入固定端口、第二数据库或桌面WebView。

## 受影响用户与角色

- 普通Buildr用户继续通过npm/released CLI或`Buildr Web`管理正式业务Workspace。
- Buildr维护者通过`projects/product/buildr`与`Buildr Web Dev`管理Buildr产品仓、fixtures和临时测试Workspace。
- Agent与Doctor能够同时观察两种安装和两种实例，但不能跨channel复用或写入Workspace。

## 核心流程

1. 普通Web启动从installation channel/runtime role解析profile和Data Root。
2. 当前profile只读取自己的instance、lock和registry；另一profile可在随机loopback端口同时运行。
3. 登记、打开或写Structured Store前，系统核对canonical real root、Workspace UUID、对侧registry与Workspace-local管理记录。
4. 发现冲突时，在`DatabaseSync`和migration之前返回包含双方channel及恢复动作的诊断；没有冲突时才允许当前channel建立或确认claim。
5. Development Launcher由自身identity启动development product，Server自动选择Development Root；Doctor分别投影两套实例。

## 关键变化

- macOS默认released Root保持`~/Library/Application Support/Buildr`，development新增`~/Library/Application Support/Buildr Dev`；Windows/Linux使用对应平台语义。
- 普通Web状态按channel隔离，product installation/release facts保持共享，Preview保持独立namespace。
- 同一真实Workspace的双重管理从UI约定升级为CLI、Launcher、注册API与Structured Store共同遵守的fail-closed安全边界。

## 影响、风险与兼容性

发布版数据不移动；development首次切换为空registry。旧released Root若仍有健康development实例，不会被覆盖或跨channel停止，需要先公开退出再按新profile重启。Workspace-local claim和registry跨两个文件无法形成单文件事务，因此使用本地锁与精确回收；任何不确定状态保留并阻断。

## 验收摘要

- released与development Server同时健康，PID/URL/instance/lock/registry不同，独立退出。
- 双向跨channel登记在SQLite打开前失败，目标SQLite hash、mtime和migration ledger不变。
- 发布版旧registry保留，development不复制正式Workspace；显式override和Preview回归通过。
- Development Launcher幂等安装并自动使用Development Root；Doctor准确展示双安装、双实例和Data Root。

## 技术artifacts入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Specifications](specs/)
- [Implementation tasks](tasks.md)
