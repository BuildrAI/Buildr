# 绑定自举 Development CLI Node

## 摘要

让 Buildr 自举安装的默认 development CLI 持久绑定 retained Node 与 checkout entry，并把完整自举恢复链作为修复 Task 的交付门禁。

## 背景与问题

安装器虽然校验了 retained Node，却只安装一个会重新扫描 PATH 的 symlink；真实默认 CLI 因而可能选择另一个兼容 Node。前一个修复 Task 没有演练最终本机投射，导致问题延迟到 post-Finish 才暴露并形成递归修复倾向。

## 目标与非目标

- 目标：原子、owned、可验证的薄 wrapper；精确 Node/entry identity；安全迁移和卸载；完整自举恢复闭环。
- 非目标：npm Launcher、Workspace Node、SEA 或平台 installer。

## 核心流程

安装器验证 retained Node 与 checkout → 验证目标 ownership → 原子写入 wrapper → 通过默认入口核对 identity → 验证 Development Launcher、sync、Doctor 与原 Finish resume preflight。

## 关键变化

- 默认 development CLI 从 managed symlink改为 identity-bound wrapper。
- foreign target fail closed；旧 Buildr managed symlink可迁移。
- 修复 Task 不再以局部测试为完成条件，必须证明真实自举闭环。

## 影响、风险与兼容性

绝对路径绑定符合 checkout-backed development channel；checkout或Node漂移会显式失败并要求重装。npm正式产品和用户Workspace数据不受影响。

## 验收摘要

脚本测试覆盖安装、重复刷新、迁移、卸载、foreign拒绝与精确Node identity；正式收尾前整链一次通过，或对无关新问题停止报告。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/buildr-cli-self-update/spec.md`
- `tasks.md`
