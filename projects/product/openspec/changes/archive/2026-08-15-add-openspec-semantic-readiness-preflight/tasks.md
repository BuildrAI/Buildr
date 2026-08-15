## 1. Semantic readiness Application

- [x] 1.1 抽取可由preflight与converge共享的current planning inputs、active Change observations和portable identity
- [x] 1.2 实现只读preflight orchestrator、稳定readiness identity与blocker category映射
- [x] 1.3 保证projected validation临时surface清理且preflight对canonical、Receipt、archive和Task authority零写入

## 2. CLI 与工作流接入

- [x] 2.1 注册`openspec convergence preflight` command descriptor、help、dispatch与公共JSON schema
- [x] 2.2 更新OpenSpec Contract Guard contribution，在apply-ready后、planning identity/Planning Review前消费preflight并由Agent处理blocked
- [x] 2.3 更新静态契约与package/runtime资产验证，保持preflight、converge和inspect边界一致

## 3. 测试与当前知识

- [x] 3.1 增加ready、Scenario omission、rename/identity、active Change conflict、projected validation failure与readiness失效测试
- [x] 3.2 增加CLI help/JSON/exit code与canonical/Receipt/archive零写入测试
- [x] 3.3 更新OpenSpec lifecycle、technical architecture与glossary，明确语义就绪预检、Planning Review和最终converge边界
- [x] 3.4 运行affected验证并修正Change artifact、实现或知识不一致
