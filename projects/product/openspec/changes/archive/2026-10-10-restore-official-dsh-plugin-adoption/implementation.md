# 官方 DSH 插件化采用结果

## 交付结果

日常 `/Applications/DeepSeek Harness.app` 已恢复为厂商签名的 macOS arm64 `0.2.0-rc.2`，内嵌提交为 `5e9e301dd9dc8923b2762f76dacfc5751f6ca851`。应用归档与官方原件逐字节相同。增强能力由自足的开发版插件（Plugin）提供，未修改官方应用或订阅插件（Plugin）的文件。

当前安装包为 `@buildr-ai/buildr-dsh-plugin-dev@0.1.0-rc.1`，压缩包 SHA256 为 `45dd1f652cb37950b131268dd8f5a12567de9424b2bd3aa9957c4fb348d9c943`。对应正式版包 SHA256 为 `b8825c6b8ce20893e41f849f0dff715220002694559b87549324a6159ad79358`。两个包各携带 282 个物理文件，可搬移安装，不依赖构建工作树（Worktree）；本轮未公开发布。

组合层通过公开配置合成、加载和撤回接口接管增强组件。原 `agent-loop` 声明身份仍由官方设置界面（Settings）管理；无关模型或界面配置更新不会重启增强组件及已创建的智能体（Agent）。合作版本只在同一运行域取得单一业务资格，不干预官方安装器。

## 验证

- 完整插件（Plugin）检查通过：333 项逻辑与集成检查、17 项来源界面检查，正式与开发自足包、真实加载器（Loader）、严格类型检查以及准确公开 Buildr 包的基础入口配对通过。
- 精确官方应用的 11 个阶段验证通过：安装、设置首次保存、停用、重新启用、版本接续、卸载及官方设置恢复。每阶段均由实际标准预设（Preset）创建并释放智能体（Agent），没有调用云端模型。
- 使用同一官方主机（Host）和准确开发包生成真实规则、技能（Skill）及 Buildr 成功／失败命令来源。43 个原事件含 5 条来源记录；独立进程冷启动后读取一致，没有手工补写会话事件（Session Event）。
- 日常官方应用在保留新登录后正常重启。原来源验证会话仍为 8 轮、23 步，输入可用，模型仍为 `Codex/gpt-6.1-sol-fast · Max`。来源列、失败详情、退出码 1、来源版本依据、Buildr 页签及右侧嵌入页面已原生核对。
- 订阅入口可用，Codex 与 Devin 各一个账号且额度可见。用户在隔离副本新完成的同账号登录已原子合并，保留其他字段、原选中账号与其他提供者；登录前后副本分别私密保存。
- 独立保全审计确认原 79 个会话目录、158 个文件全部与退出后的备份逐字节一致，7 项原配置及身份文件不变。订阅插件（Plugin）的 321 个文件和固定依赖完全一致；配置档（Profile）只改变已授权的 Buildr 包地址，组件顺序保持。

早期组合重启及旧会话输入故障由最终 V4 修复，完成依据使用最终包的检查，不将早期失败写成通过。日常会话核对没有发送新消息；新来源生产由隔离官方主机（Host）的本机受控适配器完成。

## 证据与恢复

本机证据保存在主工作空间（Workspace）的 `.buildr/local/task-runs/dsh-official-plugin-adoption/`：`full-verification-v4.json`、`packages/v4/artifacts.json`、`verification/final-v4/summary.json`、`verification/native-final-v4-observed.json`、`verification/final-daily-preservation.json` 及 `daily-adoption/` 下的采用记录。

`daily-backup/` 与 `daily-backup-latest/` 保留原应用和原数据；后者的 `DeepSeek Harness before-official.app` 是退出后的原本地应用。备份与登录快照属于私密本机材料，不进入源代码或发布物。恢复旧应用时应保留当前数据和新登录，不能用旧备份整目录覆盖新登录。

## 范围

本次证明当前 macOS arm64 官方精确发行物。未覆盖 Windows、Linux、最新预览版本或所有第三方插件（Plugin）组合。准确公开 Buildr `0.1.0-rc.38` 的基础入口通过，可选来源能力尚不受该公开包支持；日常沿用既有开发入口，真实来源能力另经实际调用验证。插件（Plugin）自足不表示本机 Buildr 应用服务无需运行。
