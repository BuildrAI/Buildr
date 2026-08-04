## 1. 远端身份与交付证据

- [x] 1.1 为 product Task Finish run 实现显式、Environment、branch upstream、唯一 remote 的确定性解析与配置校验。
- [x] 1.2 在普通 push 后回读远端 target ref，区分可恢复读取失败与 terminal target race，并禁止推断 `remoteAfterRef`。
- [x] 1.3 增加 workspace-source、远端缺失/歧义、回读成功/失败/不一致的 Integration/System 回归测试。

## 2. 契约与使用说明

- [x] 2.1 同步 Task Finish capability contract、bundled Skill、CLI/架构文档，保持五阶段与 authority 边界不变。
- [x] 2.2 收敛 Brief、current knowledge 与术语检查，只更新受本 Change 影响的事实。

## 3. 验证与收尾

- [x] 3.1 运行 Task Finish focused tests、相关 contract checks、OpenSpec strict 与 proposal guard。
- [x] 3.2 主动审查实现与证据，修复发现并确认 Change 已满足 convergence 前置，形成稳定 Content Target。
