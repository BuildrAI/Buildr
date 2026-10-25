## Why

Buildr 当前将智能体（Agent）、原厂账号和模型目录绑定，用户不能让 Codex、Qoder、DSH 共用已购买套餐。用户已在 DSH 订阅插件验证多来源使用，希望同一能力由 Buildr 管理，并首批接入 Devin。

## What Changes

- 新增统一套餐账号、动态模型目录、本机模型网关（Model Gateway）和 Devin 登录及模型调用。
- 三家智能体（Agent）保持原生工具执行与权限，只把模型推理连接到所选套餐；程序准备与套餐登录分离。
- 对话独立选择执行方和套餐模型，每轮固定来源，持久记录来源并保全原生恢复与接续。
- 本机账号与凭据按应用配置域（Profile）隔离，不读取或接管默认桌面配置，不静默切换付费来源。
- Qoder 自身套餐反向输出继续核验实际可用接口；无可证明路径时明确不可用，不能伪造模型服务。
- 内部私有库继续随 `@buildr-ai/buildr` 捆绑交付，DSH 桌面插件发布边界不变。不移除旧原生账号或对话路径；新增字段向后兼容。

## Capabilities

### New Capabilities

- `unified-model-subscriptions`: 本机套餐账号、模型发现、来源绑定、协议转换、Devin 接入及真实额度观察。

### Modified Capabilities

- `agent-runtime-connections`: 程序就绪与模型来源分离，支持网关消费及来源明确的私有配置。
- `agent-conversations`: 独立模型来源、固定本轮绑定、来源隔离的原生上下文和准确恢复。

## Impact

主要修改 `services/buildr-agent` 的模型接入、三家执行器（Executor）及公开契约，宿主 HTTP 装配和 `services/buildr-web` 对话配置。维护相应测试及当前接入说明。协议参考固定版本 MIT 项目并保留来源与许可。真实付费调用、账号登录及额度消耗与自动化替身验证分别报告，不冒充完整业务验收。
