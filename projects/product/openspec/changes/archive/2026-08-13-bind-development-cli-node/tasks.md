## 1. Development CLI 绑定

- [x] 1.1 将 `install-buildr-cli` 改为原子写入 closed Buildr-owned wrapper，精确绑定已验证 retained Node 与 checkout entry
- [x] 1.2 让安装/卸载只迁移或移除可证明的 managed wrapper/symlink，并拒绝 foreign target

## 2. 闭环验证能力

- [x] 2.1 扩展安装系统测试，覆盖精确 identity、PATH 污染、重复刷新、旧 symlink 迁移、foreign 拒绝与卸载
- [x] 2.2 在隔离自举 workspace 中演练 CLI 安装、Development Launcher、sync、Doctor ready 与原 Finish resume preflight，确保任一步失败都不会继续 finalize
- [x] 2.3 更新 onboarding、self-bootstrap closeout 与验证 registry 契约，使上述闭环成为修复交付的稳定门禁

## 3. 当前认知与收敛

- [x] 3.1 更新 Buildr technical architecture 与 Service knowledge，明确 identity-bound development CLI wrapper 和单一闭环修复边界
- [x] 3.2 将 knowledge impact 收敛到最终实现身份并核对术语无冲突
- [x] 3.3 运行 OpenSpec strict、定向测试与完整适用验证，确认没有递归修复 Task 或未覆盖的自举阶段
