## 1. 契约与 Agent 编排

- [x] 1.1 调整 recovery plan 授权语义，保留 foreign owner cleanup 显式授权并允许同一 current closeout 自动重试一次
- [x] 1.2 更新 self-bootstrap Skill 与 Task Finish contribution，限定零副作用、同 run、一次重试和停止报告边界

## 2. Latest dev preflight

- [x] 2.1 在 runner preflight 中加入 clean retained `dev` 到最新远端 ref 的显式 fast-forward
- [x] 2.2 对分叉、merge、未知 provenance、dirty tree、identity 漂移和再次出现 foreign carrier 保持 fail closed

## 3. 证据与知识

- [x] 3.1 扩展集成测试，覆盖授权区分、foreign 清除后基于最新远端 dev 继续及无法安全承接时停止
- [x] 3.2 更新 Component integrity、Change Brief 与相关 current knowledge
- [x] 3.3 运行 focused tests、OpenSpec strict validation 与 semantic readiness preflight
