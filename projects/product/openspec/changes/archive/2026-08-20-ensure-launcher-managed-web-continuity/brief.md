# 保证 Buildr Web Launcher 托管连续性

一句话摘要：正式 Launcher 遇到同 profile 的非 Launcher 托管 Web 实例时，先证明归属并完成有界、认证的托管交接，再返回成功。

## 背景与问题

当前 Runtime 只要发现同 profile、协议兼容的健康实例就直接复用，不区分该实例来自 Launcher 还是普通 `buildr web`。图形入口因此可能复用仍依附原终端的 CLI 实例，让用户误以为服务已转为后台托管；原终端结束后，正式 Web 随之消失。

## 目标与非目标

- 目标：精确复用当前 Launcher binding 已托管的健康实例。
- 目标：对可证明属于当前 npm installation 的 CLI 实例或同 installation slot 的旧 Launcher 实例完成认证、有界的交接。
- 目标：保持 profile、installation ownership、单实例和 fail-closed 边界。
- 非目标：不强杀未知进程，不跨 released/development profile 接管，不改变页面或 Launcher 安装流程。

## 受影响用户与核心流程

使用正式 `Buildr Web.app` 或 Windows shortcut 的 npm 用户受影响。点击 Launcher 后，Runtime 在 profile start lock 内重新观察实例：当前 binding 已托管则直接复用；可证明归属的非当前实例先通过 instance secret 请求正常退出，等待 receipt 消失，再由当前 binding 启动新实例；归属不完整、冲突或超时则停止并报告诊断。

## 关键变化

- 将“协议兼容”和“Launcher ownership 匹配”分开判断。
- 增加只接受当前 binding 的等待与交接路径，避免并发启动者复用任意健康实例。
- 复用现有认证退出端点，不使用 `SIGKILL`；交接超时保持旧实例和可诊断状态。
- Runtime 补充 `SIGHUP` 清理，使异常终端退出留下 receipt 的概率降低，但它不替代 Launcher 托管交接。

## 影响、风险与兼容性

普通 CLI 启动语义不变。Launcher 首次接管可感知地重启一次 Web；若旧实例无法正常退出，Launcher 会失败而不是制造双实例或强杀进程。旧 binding 只有在 installation slot 与 ownership 可证明时才可被替换。

## 验收摘要

- 当前 binding 的健康实例直接复用。
- 同 profile、同 npm installation 的 CLI 实例由 Launcher 安全接管，旧 PID 退出且新实例记录当前 binding。
- foreign、信息不完整或跨 profile 实例不被停止。
- 交接超时明确失败，不启动第二实例。
- `SIGHUP` 清理 instance receipt，并保持既有 `SIGINT`、`SIGTERM` 行为。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta Spec](specs/local-workspace-application/spec.md)
- [Tasks](tasks.md)
