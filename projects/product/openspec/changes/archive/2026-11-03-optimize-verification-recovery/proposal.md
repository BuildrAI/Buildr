## Why

rc.54 暴露了大型节点局部失败需整组补验、原包交接滞后、工作流隐式跳过与等待诊断不足。现在优化可减少重复执行，同时保留真实完整证据；无公开 API 破坏性变更，旧候选结果仍可读，旧结果缺少文件证明时保守重验。

## What Changes

- 在候选轮次普通结果中保存文件级成功及输入身份，仅补失败或失效文件，完整发现集合汇总。
- 直接修正候选消费者工作流条件，删除源码证明传递作业。
- 原包上传就绪后下载并返回本机交接，远端继续；等待覆盖修复派发与主线采用。
- 输出阶段耗时、进程与文件失败诊断，减少轮询刷新；稳定监听测试握手，删除无独立价值断言。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`: 候选失败节点文件级补验与完整汇总。
- `open-source-release-governance`: 原包就绪交接、工作流依赖与有界等待诊断。

## Impact

现有 verification/candidate-round、verification-reuse、executor、GitHub verify 工作流和 buildr-release 随附编排代码。维护验证架构、发布流程与工具地图，不新增分类、门禁、审批或发布副作用。
