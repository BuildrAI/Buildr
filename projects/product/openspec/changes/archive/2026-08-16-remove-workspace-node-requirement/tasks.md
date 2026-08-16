## 1. Product 精确开发 Node

- [x] 1.1 在Buildr Product checkout建立唯一精确development Node `24.15.0` authority，并让development CLI对兼容但非精确Node fail closed
- [x] 1.2 提供Product-owned npm执行wrapper，更新`preparation.yml`与`verification.yml`使用同一精确Node而不依赖Workspace runtime
- [x] 1.3 对齐CI、development installation与self-bootstrap前置Node identity检查，增加hostile PATH和缺失精确Node诊断测试

## 2. Workspace Node Domain退役

- [x] 2.1 让Workspace reader兼容忽略旧`runtime.node`，domain/public model与canonical renderer不再包含runtime
- [x] 2.2 删除init/sync的Node写入、下载恢复与输出，Doctor不再产生Workspace Node finding
- [x] 2.3 删除Workspace Node runtime infrastructure、执行脚本、package exports与不再适用的专项测试

## 3. 专业执行链解耦

- [x] 3.1 Verification按声明argv和受控环境直接执行，删除Node特殊绑定、PATH注入、execution identity/record/recovery/public JSON字段
- [x] 3.2 Task Environment删除全局Node probe，让`workspace-foundation`只解析显式Step的当前环境命令并记录executable identity
- [x] 3.3 Task Finish删除Workspace Node readiness、run/resolvedContext identity、漂移检查和恢复输入，兼容读取旧附加字段

## 4. 契约、知识与产品验证

- [x] 4.1 更新public JSON schemas、package/static guards、release verifier、fixtures与产品声明，删除全部运行时Workspace Node consumer
- [x] 4.2 更新technical architecture、Buildr Service current knowledge、release flow与glossary，完成knowledge impact和术语对齐
- [x] 4.3 增加无Node Workspace健康、非Node Verification/Environment、canonical sync字段移除、旧runtime保留和自举精确Node回归
- [x] 4.4 运行OpenSpec strict/preflight、focused与affected Product验证并修复本Change引入的问题，确认Change已具备deterministic convergence/archive条件
