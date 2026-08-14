# 保持 Buildr Web Dev 自举激活连续性

一句话摘要：自举激活刷新 Development Launcher 后，仅恢复安装前已经健康的默认 Buildr Web Dev，并保持同一端口与新 retained identity。

## 背景与问题

当前 development-only Launcher manager 会在切换 Launcher 前认证并停止健康实例，但 self-bootstrap runner 没有恢复步骤。最终 Doctor 可以 ready，而用户原本使用中的 HTTP server 已退出。

## 目标与非目标

- 目标：认证安装前状态；健康 development 实例同端口恢复；恢复后验证新 Launcher、retained checkout、commit 与 Node；失败时回收本次异常进程并阻塞后续 activation。
- 非目标：不在原本未运行时自动启动；不改变 npm-owned Launcher、Task preview、Environment cleanup 或 Formal Task Finish；不增加持久 workflow authority。

## 受影响用户或角色

主要影响在 Buildr 自举 Workspace 中开发 Buildr 并依赖默认 Buildr Web Dev 的维护者。普通 npm 用户与普通 Workspace 不获得该专属行为。

## 核心流程

1. runner 在 Launcher 安装前读取默认 instance state，并用 secret health 认证 ownership、channel 与 loopback 端口。
2. development-only manager 按原有规则停止 owned 实例并原子更新 Launcher。
3. 仅当步骤 1 证明健康 development 实例时，bundled helper 通过 retained Project bridge、retained Node 与新 Launcher identity 在原端口启动。
4. helper 等待 health 并验证 port、PID、source root、successor commit 与 Node；失败则回收本次子进程，runner 停止后续 gate/Doctor/resume。

## 关键变化

- `install-local-app` 阶段增加安装前 continuity observation 和条件式 recovery。
- 新增 runner 自带、无 Product 内部 import 的 development Web continuity helper。
- activation result 只增加 ephemeral operation/effect evidence，不写新 store。

## 影响、风险与兼容性

同端口单实例仍会有短暂重启窗口，不能保证连接零中断。安装失败继续使用 manager 的 Launcher rollback；恢复失败不回退已交付 Launcher，只清理本次启动的异常子进程并 fail closed。未运行、陈旧或其他 channel 的实例保持现状，兼容现有按需启动语义。

## 验收摘要

- 安装前健康 development 实例在安装后以不同 PID、相同端口和新 identity 恢复。
- 未运行、陈旧或不同 owner 时不自动启动。
- 启动超时或 identity 漂移时回收本次进程，且不执行 development entry gate、Doctor 或 Finish resume。
- OpenSpec strict validation 与相关 runner/system verification 通过。

## 技术 Artifacts

- `proposal.md`
- `design.md`
- `specs/buildr-package-assets/spec.md`
- `tasks.md`
