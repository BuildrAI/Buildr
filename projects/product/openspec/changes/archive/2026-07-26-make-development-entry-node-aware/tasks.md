## 1. 启动器实现

- [x] 1.1 将 Project bridge 改为转发到 Service 自有开发启动器的薄 shell 入口
- [x] 1.2 实现 `BUILDR_NODE`、PATH Node 与 Agent bundled Node 的确定性兼容版本选择和失败诊断

## 2. 契约与验证

- [x] 2.1 更新 Product source layout contract test 和 verifier，覆盖薄 bridge 新形态
- [x] 2.2 增加开发启动器测试，覆盖兼容 PATH Node、显式 override、bundled Node fallback 和无兼容 Node

## 3. 当前认知

- [x] 3.1 更新受影响的开发入口说明并完成 current knowledge reconcile
