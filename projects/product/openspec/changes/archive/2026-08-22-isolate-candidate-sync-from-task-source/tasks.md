## 1. Runtime 写入边界

- [x] 1.1 为 `render` 增加包含产品入口 Buildr Skill 的纯投射参数并固定 CLI 帮助契约
- [x] 1.2 在完整 `sync` 首个 mutation 前拒绝 linked candidate 对自身源码 checkout 的 source sync，并返回可执行诊断

## 2. Task Environment 编排

- [x] 2.1 将候选 runtime 准备从完整 `sync` 切换到包含产品 Skill 的纯 `render`
- [x] 2.2 保持候选 `runtime check`、projection identity 与 Environment Receipt ready 语义不变

## 3. 验证与契约

- [x] 3.1 增加 runtime authority 回归测试，覆盖危险 sync 零写入、隔离 sync 与 retained 合法路径
- [x] 3.2 增加 Task Environment 回归测试，证明候选准备调用纯投射且 task checkout Git 状态不被 source sync 污染
- [x] 3.3 运行相关单元、集成、系统与 package 静态验证，并收敛 OpenSpec strict validation
