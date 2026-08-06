# Windows 命令与 Runtime 探测误报告警修复

## 一句话摘要

修复 Windows npm `.cmd` 命令版本探测误报，并停止在非 macOS 上执行 TRAE Work、WorkBuddy 的 macOS `defaults` 探测。

## 背景与问题

Windows PATH 解析能够发现 `.cmd` shim，但版本 probe 使用无 shell 的裸 executable，导致已安装工具被报告为版本未知。两个 desktop adapter 又固定调用 macOS `defaults`，使 Windows/Linux runtime check 产生不适用的安装告警。

## 目标与非目标

目标是让命令版本 probe 使用当前平台可执行入口、细分启动失败与输出不可解析，并让 desktop environment probe 按平台选择 command 或 manual guidance。非目标是自动安装外部工具、验证真实 Agent 会话或改变 projection missing/stale/conflict 语义。

## 核心流程

Command check 先解析 PATH 入口，再以静态 token 参数执行版本 probe；Windows `.cmd`/`.bat` 仅使用受限 shim 启动适配。Runtime check 在 macOS 保留 `defaults`，其他平台返回人工确认状态，不生成安装缺失 warning。

## 关键变化

- 增加 Windows shim invocation helper 与 spawn failure reason/code。
- `TRAE Work`、`WorkBuddy` 的非 macOS installation/version probe 改为 manual。
- 增加命令领域与 runtime adapter 回归测试。

## 影响、风险与兼容性

无需数据迁移或新增依赖。Windows shim 仅对 PATH 解析出的 `.cmd`/`.bat` 启用平台适配，参数仍为静态 token；非 macOS desktop 安装事实由用户按 guidance 确认。

## 验收摘要

命令领域单元测试、runtime adapter contract、OpenSpec strict validation 和 `test:changed` 通过；验证期间同步对齐了一条 dev 既有的 Task Finish 文案断言，不改变产品行为。

## 技术 artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [delta specs](specs/)
- [tasks.md](tasks.md)
