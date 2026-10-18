## Why

普通初始化目前只准备工作空间（Workspace）文件及智能体（Agent）入口，不登记到本机 Buildr Web。首次使用者打开启动器（Launcher）后仍需手动添加目录，README 的“初始化后配置项目”缺少这一步衔接。用户已明确授权补齐默认登记。

## What Changes

- 普通 `buildr init` 在源资产准备完成后，复用现有登记应用，将目录加入当前产品对应的本机 Buildr Web 列表，再继续同步和诊断。
- 已登记目录保持幂等，不新增网页进程、不创建第二套登记存储、不改变另一产品渠道的归属。
- `--source-only` 保持只初始化源资产；非法输入在写入前失败。登记或后续运行时准备失败时，明确报告阶段并保留已经成立的结果。
- 校准初始化帮助、安装参考、随包技能（Skill）、使用指南及中英文 README 的首次使用顺序。
- 这是有意新增的本机登记副作用；无删除、迁移或公共协议格式破坏性变更，显式纯源资产路径保持兼容。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `human-agent-onboarding`：普通初始化默认登记本机工作空间（Workspace），明确纯源资产模式、幂等与失败边界。

## Impact

- 实现：`services/buildr/src/modules/workspace/` 的初始化应用与命令说明，复用现有登记、版本锁和管理归属保护。
- 检查：现有初始化代表旅程与有界初始化测试，全部使用独占本机数据目录。
- 说明：安装参考、使用指南、随包 Buildr 技能（Skill）指引和当前任务的中英文 README 候选。
- 不修改前端交互、默认安装、本机真实登记或上游 OpenSpec；任务说明见[任务说明](@task/refine-buildr-readme)。
