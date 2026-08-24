# 隔离 Launcher 测试并稳定 Buildr Web Dev

## 一句话摘要

让普通 Buildr 验证完全无界面、无默认浏览器副作用，并让 Buildr Web Dev 通过固定端口 `4458` 保持可预测入口和自举连续性。

## 背景与问题

当前 release smoke 会调用真实平台 Launcher。macOS `open`、LaunchServices 环境传播和 Launcher 的失败通知与测试生命周期耦合后，测试清理可能触发“Buildr Web 无法启动”弹窗，也可能打开并遗留默认浏览器标签页。Development Launcher 同时使用随机端口，自举同步只能尝试保留当次观察到的临时地址，导致开发入口在重装或同步后不稳定。

## 目标与非目标

目标是让普通 affected/full/Candidate 验证只使用隔离数据根、随机测试端口、无头浏览器和 no-open/no-notify 边界；将真实平台入口作为独立显式验收；让 Development Launcher 固定使用 `4458`，并在 self-bootstrap 更新后恢复安装前的运行意图。非目标是不关闭用户已有浏览器标签页、不改变正式 npm Launcher 的 `4457` 策略、不改变 Task Preview 的随机端口，也不修改 Buildr Web 前端。

## 受影响用户或角色

主要影响开发和发布 Buildr 的 Agent、维护者及 CI。普通 Buildr Web 用户只会获得更稳定的 Development Launcher；真实安装或 binding 漂移仍保留可见失败诊断。

## 核心流程

普通验证直接执行已生成 Launcher 的无界面入口，在临时 Root 中等待 health 后清理 owned process；只有显式 Platform Launcher Integration 才经过 `.app` 或 shortcut，且仍禁止浏览器与系统通知。Development Launcher 启动 `127.0.0.1:4458`。self-bootstrap 安装前认证 Development Root 中的实例：健康运行则更新 Launcher 后迁移/恢复到 `4458`，未运行则只安装不启动。

## 关键变化

- 默认验证不再调用 macOS `open`、Windows GUI shortcut、系统通知或默认浏览器。
- 平台启动入口集成（Platform Launcher Integration）与浏览器使用测试（Browser Use Test）成为不同测试责任。
- macOS Launcher 支持验证专用 no-notify 传播，但生产失败诊断保持不变。
- Buildr Web Dev 固定端口为 `4458`，foreign 占用时明确失败且不随机回退。
- self-bootstrap 使用正确的 Development Web Data Root，并把历史随机端口实例认证迁移到固定端口。
- 恢复失败形成自举激活注意（Activation Attention），不回滚已经交付的代码。

## 影响、风险与兼容性

历史随机端口实例会在首次适用 self-bootstrap 时迁移到 `4458`。若该端口被 foreign 进程占用，Development Web 恢复会停止在可诊断状态，保留占用者、交付事实与已安装 Launcher。公开 CLI、HTTP API、正式 npm Launcher 和 Preview 端口语义保持兼容。

## 验收摘要

自动测试必须证明普通验证不产生 GUI/默认浏览器副作用，平台验收只能显式运行且使用隔离 Root；两平台 Development Launcher 均生成 `--port 4458`；self-bootstrap 覆盖健康实例迁移、未运行不启动、foreign 占用失败和新 PID/retained identity 检查。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/buildr-web-channel-isolation/spec.md`
- `specs/local-app-browser-verification/spec.md`
- `specs/product-verification-quality/spec.md`
- `specs/buildr-package-assets/spec.md`
- `tasks.md`
