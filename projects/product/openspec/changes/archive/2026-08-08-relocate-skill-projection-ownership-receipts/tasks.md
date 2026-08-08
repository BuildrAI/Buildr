## 1. 路径与迁移基础

- [x] 1.1 增加 destination-aware canonical receipt resolver 与精确 legacy resolver，保持 `buildr.skill-projection/v2` schema 不变
- [x] 1.2 为 workspace、user、home-as-workspace 和嵌套 runtime path 补齐路径单元测试
- [x] 1.3 实现 canonical/legacy 缺失、等价、冲突和不可证明四类迁移 observation

## 2. Runtime 消费者收敛

- [x] 2.1 让 Skill inventory、render plan 和 reconcile 统一使用 canonical resolver，并原子执行写新删旧
- [x] 2.2 让产品入口 Skill、Component lifecycle 与 builtin lifecycle 使用同一迁移边界
- [x] 2.3 让 Doctor 和 runtime check 从 canonical 路径发现受管 runtime，并对 legacy-only 与 dual-conflict 返回明确诊断

## 3. Workspace 基线与兼容性

- [x] 3.1 让 package baseline、init 和 sync 幂等维护 `/.buildr/agent-runtime/` Git ignore
- [x] 3.2 更新 CLI/reference、adapter 文档和 CHANGELOG，说明新路径、旧 CLI 边界与自动迁移行为
- [x] 3.3 更新 Change Brief 与技术架构中的 runtime 内容/控制状态边界
- [x] 3.4 在 Project glossary 固定“Skill 投射所有权回执（Skill Projection Ownership Receipt）”并完成术语核对

## 4. 回归与收敛准备

- [x] 4.1 覆盖七个 adapter 的 canonical receipt parity、完整 Skill stale cleanup 与重复 render 幂等性
- [x] 4.2 覆盖 legacy-only、dual-equivalent、dual-conflict、runtime drift 和 workspace/user 隔离的集成测试
- [x] 4.3 覆盖 Doctor present runtime discovery、Component uninstall 与 builtin replacement 的新路径回归
- [x] 4.4 完成 OpenSpec strict validation、Change checklist 与 deterministic convergence/archive readiness 检查
