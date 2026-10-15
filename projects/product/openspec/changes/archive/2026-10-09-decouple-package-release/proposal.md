## Why

插件（Plugin）的源码交付目前借用主包版本作为发布选择身份，准备入口因主包版本已公开而停止，且完整检查硬编码相邻主包源码。两个包需要独立演进，也需要能够明确选择联合发布；现在应拆开源码交付、兼容性证明与各包公开发布事实。

## What Changes

- 统一发布入口接受仅 Buildr、仅 DSH 插件（Plugin）或两者联合，分别保存准确版本、候选（Candidate）和公开事实；既有主包默认入口继续兼容。
- 源码选择使用独立身份，复用现有基线（Baseline）、有序提交选择、冻结、受保护 `main` 纳入与恢复；不自动纳入无关 `dev` 内容。插件独立交付不要求创建主包新版本。
- 两包声明公共兼容契约，候选（Candidate）核对准确已公开对端产物（Artifact）；联合核对新组合与中间状态，按安全顺序分别发布。
- 插件（Plugin）完整检查显式消费已发布主包或联合主包候选（Candidate），不借相邻源码冒充公开版本能力。基础打开能力与可选文件来源读取分开证明。
- 一方已公开或请求结果未知时，恢复只补尚未完成事项；保留现有可信发布（Trusted Publishing）身份、原字节发布和凭据隔离边界。
- 本变更不执行真实发布、npm 信任配置或令牌（Token）变更；`main` 激活仍需独立确认。旧主包调用不包含破坏性变化，新组合与兼容声明使用显式新字段。

## Capabilities

### New Capabilities

- `package-release-compatibility`：独立版本、真实对端产物（Artifact）证明、联合发布顺序与局部兼容性诊断。

### Modified Capabilities

- `release-collection-model`：源码选择身份与包版本分离，三种目标及恢复身份保持唯一。
- `open-source-release-governance`：按实际差异要求对应候选验证（Candidate Verification），分别编排授权与部分发布恢复。
- `dsh-plugin-distribution`：插件（Plugin）独立交付及完整检查不再强制主包新版本或相邻开发源码。

## Impact

涉及 `services/buildr/tools/release/`、相关验证工具与测试、`services/dsh-plugin/tools/` 及业务集成检查、两个包的兼容元数据、`verify.yml`、项目准备／验证声明（Declaration）、发布流程知识与产品自举发布技能（Skill）源。两个公开发布工作流（Workflow）仍分别拥有发布身份，不增加公开写入权限。当前主包已公开版本与同版本开发源码必须视为不同产物（Artifact）。
