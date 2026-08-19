## 1. Host Node matrix authority

- [x] 1.1 让 Host Node verification entry 把 hosted tuple 的实际 Node 作为 executor authority，同时保留 executable/PATH audit。
- [x] 1.2 增加 minimum/current tuple 不受 development `.node-version` 误约束且 hostile PATH 仍解析到实际 Node 的回归测试。

## 2. macOS Launcher determinism

- [x] 2.1 让 macOS Launcher wrapper 从 binding Host Node 重建 PATH 首项并输出实际 Node identity。
- [x] 2.2 让 release smoke 的 LaunchServices 入口显式传递 exact PATH，并校验 Launcher health runtime identity。

## 3. Readiness 与失败 evidence

- [x] 3.1 将 Launcher readiness 改为 15 秒独立 wall-clock budget，并在超时诊断中包含 elapsed、budget、instance 与 process identity。
- [x] 3.2 在临时根清理前把 launcher log、脱敏 instance、process observation 和 exact Node audit保存到既有 Candidate diagnostics。
- [x] 3.3 增加 readiness timeout、secret 脱敏、evidence 路径/日志保留和正常 stdout/stderr/phase 不丢失的自动化测试。

## 4. Contract convergence

- [x] 4.1 更新 verification/release contract tests，证明 coverage、单一 tarball owner、shard ownership和aggregate fail-closed输入未改变。
- [x] 4.2 运行适用的 Static、Unit、Integration 与 release focus checks，并收敛 Brief/current knowledge impact evidence。
