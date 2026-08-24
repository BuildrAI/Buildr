## 1. 兼容收敛

- [x] 1.1 将 linked candidate/self-checkout sync 分类为 projection-only compatibility disposition
- [x] 1.2 在任何 Workspace 初始化和 source/store mutation 前执行包含产品 Skill 的纯投射并输出迁移提示

## 2. 回归验证

- [x] 2.1 更新 runtime authority 测试，证明兼容调用成功、零初始化/source mutation 且合法 sync 不受影响
- [x] 2.2 用上一版 retained Task Environment controller 重新 prepare 当前 Environment 并通过 Product 快速验证
