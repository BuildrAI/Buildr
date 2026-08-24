## 1. 建立 Task Record 模块切片

- [x] 1.1 将 Task Record Domain、Application 和 SQLite Row/Mapper/Repository 移入 `src/task/` 对应技术层，并更新全部内部 import
- [x] 1.2 新增 `src/task/module.mjs`，按既有顺序注册唯一 Task Record repository 与 application，并让 composition root 只消费该入口

## 2. 迁移接口适配与调用方

- [x] 2.1 将 Task Record CLI Adapter 移入模块并更新 CLI registry，保持命令、参数、输出和错误映射不变
- [x] 2.2 将 Task Record list/detail/update/complete/abandon HTTP Adapter 移入模块，保留 HTTP Host 的安全、body、response 与错误边界
- [x] 2.3 更新 Doctor、其他 Task 能力和测试对 Task Record Domain/Application 的直接 import，删除全部旧路径实现与引用

## 3. 收紧架构与验证

- [x] 3.1 扩展 architecture verifier，使其识别模块内部技术层、单一模块入口和旧路径消失
- [x] 3.2 更新 Verification registry affected inputs 与静态交付检查，确保 `src/task/**` 变更选中真实验证
- [x] 3.3 运行旧路径扫描、OpenSpec strict validation、架构检查、Task Record unit/integration/system 和 affected verification，并修复发现的问题
- [x] 3.4 更新 Change brief、knowledge impact 与技术架构当前认知，记录已验证边界和未迁移范围
