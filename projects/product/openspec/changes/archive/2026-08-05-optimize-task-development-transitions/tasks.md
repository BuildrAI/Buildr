## 1. 性能基线与诊断

- [x] 1.1 增加 Task Development driver 的 opt-in `--profile` 输出，区分 module load、composition、Application、serialization 与 total，并保持默认 JSON shape 不变
- [x] 1.2 增加 profile contract test，证明计时为非负 response evidence且普通 action兼容

## 2. Operation-scoped 优化

- [x] 2.1 在 Workspace SQLite infrastructure 实现同步 operation scope，只在单次 action 内复用 canonical Workspace 判定，并确保返回、失败和跨 action 后重新观察
- [x] 2.2 缓存默认 package migration assets 的已验证只读解析结果，自定义 migration root继续实时读取
- [x] 2.3 将Task Development actions接入operation scope，并让Task Record/Environment owner Application在相同输入下复用完整read model，不改变repository transaction、SQLite connection、Receipt或professional Application authority

## 3. 回归与收敛

- [x] 3.1 增加integration tests，证明同一action最多一次Git canonical observation、scope不跨action/异常泄漏且结果语义等价
- [x] 3.2 运行Task Development直接相关测试与changed verification，记录优化前后多次真实driver profile样本
- [x] 3.3 收敛Brief/current knowledge影响，完成OpenSpec strict validation与archive readiness检查
