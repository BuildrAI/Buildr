## 1. 默认 CLI identity 基础能力

- [x] 1.1 为 `scripts/run-development-cli` 增加 runner-only identity inspection，返回 launcher、CLI entry 与实际 Node identity，并保持正常 CLI 行为不变
- [x] 1.2 在 self-bootstrap runner 中实现按 PATH 解析默认 `buildr`、入口链 realpath 核对及 retained package/version 核对
- [x] 1.3 将 CLI identity evidence 加入当前 runner Result，并让所有不匹配与启动失败路径 fail closed

## 2. 唯一 runner 流程收敛

- [x] 2.1 在所有适用安装动作后增加唯一 identity gate，complete 模式通过已验证默认入口运行最终 Doctor
- [x] 2.2 doctor-blocked 模式通过已验证默认入口恢复同一 Finish run，并保持 resume 内 Doctor 为唯一最终结论
- [x] 2.3 更新 `buildr-self-bootstrap-sync` Skill 与 Contribution，声明 Agent 不得自行编排 sync、安装、CLI 检查或补跑 Doctor

## 3. Rule 与知识对齐

- [x] 3.1 将根与 Product `AGENTS.md` 的手工流程收敛为默认 CLI 绑定 retained checkout 且最终 Doctor ready 的结果约束
- [x] 3.2 更新 Buildr service 与 OpenSpec lifecycle current-state knowledge，记录默认 CLI identity gate 和唯一 finalize 入口

## 4. 验证

- [x] 4.1 增加 launcher inspection 与 runner happy-path测试，证明 PATH `buildr` → retained launcher → retained `bin/buildr.mjs` → matching package/version
- [x] 4.2 增加 PATH shadowing、旧 symlink、入口链不匹配、版本不一致和启动失败的 fail-closed fixtures
- [x] 4.3 验证 complete 只通过默认入口运行一次最终 Doctor，doctor-blocked 只通过默认入口 resume 且不补跑第二个 Doctor
- [x] 4.4 运行定向测试、OpenSpec strict validation与package/runtime parity，形成Change收敛前的直接验证反馈
