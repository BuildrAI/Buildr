# Buildr 安装与恢复指南

本指南供智能体（Agent）在 Buildr 技能（Skill）尚未发现、损坏或需要维护产品时使用，已安装后可通过 `buildr bootstrap guide` 读取。它承接用户目标，区分产品安装、工作空间（Workspace）同步与专业执行；准备完成后继续实际工作。

## 先确认入口和目标

首次安装从 npm 官方仓库查询 `@buildr-ai/buildr` 的实际版本及 `engines`。运行产品的 Node.js 必须满足 `>=24.15.0 <25`，安装包不会自动下载替代运行环境。正式版（GA）对应 `latest`，候选版（RC）对应 `next`；查询标签还需检查版本是否为预发布版本，不因本文面向 0.1.0 就宣称正式版已经发布。

```bash
npm view @buildr-ai/buildr dist-tags --json --registry https://registry.npmjs.org/
```

按用户选择安装已查实的版本，先替换下面的 `<version>`：

```bash
npm view "@buildr-ai/buildr@<version>" version engines --json --registry https://registry.npmjs.org/
npm install --global "@buildr-ai/buildr@<version>" --registry https://registry.npmjs.org/
buildr --version
buildr installation status --json
```

安装后核对实际版本与安装来源。Buildr Web 已包含在产品包内；用户按首页要求安装图形入口，或明确需要 macOS / Windows 的启动器（Launcher）时，执行 `buildr web launcher install` 并核对其绑定的同一 npm 安装。其他平台直接打开本机网页。全局安装不向未知目录初始化工作空间（Workspace）。

确认目标工作目录和当前智能体（Agent）。通过下面的只读命令核对支持列表，将 `<agent>` 替换为当前宿主的明确标识；不从技能（Skill）所在路径或诊断结果猜测宿主身份。

```bash
buildr runtime list --json
```

当前支持 `claude-code`、`codex`、`cursor`、`qoder`、`trae`、`trae-work` 和 `workbuddy`。无法对齐时只停止依赖该运行时（Runtime）的动作，不借用其他适配器（Adapter）。后文 `<dir>` 始终指工作空间（Workspace）根目录，不能替换成其中的服务（Service）代码目录；执行前替换全部占位内容。

## 首次初始化与第一项工作

尚未初始化且目标目录已确认时，保留已有内容，用一个命令完成源资产、产品入口技能（Skill）、当前智能体运行时（Agent Runtime）投射和最终诊断（Doctor）：

```bash
buildr init --agent "<agent>" --target "<dir>" --name "<name>" --description "<description>" --profile "<profile>"
```

`<profile>` 为 `personal`、`team` 或 `company`。已有工作空间（Workspace）不重复初始化；只需要在未初始化目录单独安装或恢复产品入口技能（Skill）时，使用 `buildr skill install "<agent>" --target "<dir>"`。

初始化返回的最终诊断（Doctor）可直接复用。结合用户的工作解释：工作空间（Workspace）是共同目录，项目（Project）承载业务目标，服务（Service）承担实现职责，代码库实例（Repository Instance）指向真实代码。然后打开 `buildr web --target "<dir>"`，引导用户在网页中配置项目（Project）、服务（Service）及代码位置；没有代码也可以开始。用户愿意通过对话配置时，按下方入口处理。完成后让用户在智能体（Agent）工具中打开该工作目录，开始正常任务（Task）；不另造欢迎文件或固定教学规则（Rule）。

接入已有内容前读取现状与当前输入说明：

```bash
buildr assets inspect --target "<dir>" --json
buildr help assets
```

`inspect` 返回 `migrationRequired: true` 时，先核对现有对象和重名问题；即使刚完成初始化，也可能需要这一步。准备包含当前 `revision` 的输入文件，运行 `buildr assets migrate --target "<dir>" --input "<json-file>" --json`，再使用返回的新版本。旧服务（Service）重名时按已确认取舍补充 `codeMappings`；迁移不搬动代码。

新建或登记项目（Project）、服务（Service）和代码库实例（Repository Instance）使用 `assets` 入口，输入包含刚读取的 `revision` 和用户明确的内容。当前帮助只列出动作和通用参数；最小新项目（Project）输入为 `{"revision":"<当前版本>","code":"<项目标识>","name":"<项目名称>","description":"<项目目标>"}`，写入临时文件后运行 `buildr assets create project --target "<dir>" --input "<json-file>" --json`。已有目录先用 `assets project-candidates`、`service-candidates` 或 `repository-candidates` 取得目录观察，再登记选定结果；项目（Project）通过 `serviceIds` 引用服务（Service），服务（Service）引用一个 `repositoryId`。

当前全局清单下不使用旧 `service create <project>/<service> <repo-ref>`，该入口仅保留给未迁移的旧工作空间（Workspace）。登记代码来源不执行克隆；代码缺失时由智能体（Agent）按已确认来源和授权准备，已有代码先核对身份与未提交内容。写入后检查实际结果，专业声明缺口交给 `declaration-intake` 按需处理。

## 更新产品与同步工作空间（Workspace）

已有安装中，用户要求完整检查或更新 Buildr 时，先运行：

```bash
buildr update check --json
```

分别说明 GA 正式版与 RC 候选版的实际状态，让用户选择 `stable`、`candidate` 或暂不更新。已有明确选择且范围未变时直接执行；缺少选择时才询问，不得自动切轨或降级。对于 npm 安装：

```bash
buildr update --track <stable|candidate>
```

上面是参数选择说明，执行时用单个 `stable` 或 `candidate` 替换占位内容。成功后重新解析当前命令入口，并在已经确认的工作空间（Workspace）运行 `buildr skill install "<agent>" --target "<dir>"`。用户明确只更新命令行工具（CLI）时不追加技能（Skill）安装或工作空间（Workspace）同步。源码开发检出（Development Checkout）更新不接受 `--track`，应按其明确源码目标和当前帮助处理。

用户要求“更新工作空间”或“同步工作空间”时，先确认根目录是否受 Git 管理。受 Git 管理时，按 `buildr.git-operations/v1` 能力绑定（Capability Binding）读取已选提供者（Provider），明确上游和更新动作；遇到本地改动、分叉、冲突、缺少上游或提供者（Provider）不可用时，停止相关更新与同步，不擅自暂存、重置、变基、合并或覆盖。Git 更新成功后不重复询问同步；不受 Git 管理时直接同步：

```bash
buildr sync "<agent>" --target "<dir>"
```

`sync` 同步当前本地产品源能力、产品入口技能（Skill）和当前运行时（Runtime），并返回最终诊断（Doctor）；它不隐式更新 Git 或产品安装。用户同时要求更新产品与工作空间（Workspace）时，按选定产品版本更新成功后继续同步，分别确认结果。产品更新包含包内的 Buildr Web；已有启动器（Launcher）绑定由安装更新流程刷新，核对更新后网页能否打开。无需让用户另提“更新 Buildr Web”。用户要求更新完成后收尾时，确认两项实际结果后再承接收尾。

## 诊断与资源维护

已有工作空间（Workspace）且需要当前诊断时运行一次，当前同一现场的结果可复用：

```bash
buildr doctor --agent "<agent>" --target "<dir>" --json
```

不要省略 `--agent`；省略会检查所有支持的运行时（Runtime）。`init --agent`、`sync`、组件（Component）安装及卸载已包含最终诊断（Doctor），无需立即重复。出现某类问题时只展开该类检查，不能把一次同步称为对所有问题的完整修复。

- 根 `AGENTS.md` 中的受管区块（Managed Block）由 Buildr 维护。专业规则（Rule）从 `rules/manifest.yml` 按启用、安装、必需和语义相关性发现；项目（Project）与服务（Service）的规则入口是各自 `AGENTS.md`。
- 技能（Skill）源只在工作空间（Workspace）的 `skills/` 管理。项目（Project）的 `capabilities.yml` 保存适用性与能力绑定（Capability Binding），不是另一份技能（Skill）源。`init` 和 `sync` 只投射到工作空间（Workspace）层；用户明确要求个人全局使用时才选择 `user`。
- 新增根规则（Rule）先维护 `rules/<rule-id>.md`，再运行 `buildr rules add <rule-id> --target "<dir>" --description "<text>"`。删除使用 `rules remove`，只取消登记并保留文件时加 `--keep-file`。
- 维护组件（Component）前用 `buildr component list` 和 `buildr component check` 核对整体成员和所有权；安装或卸载传入 `--agent`。卸载须在已明确的完整范围授权内进行，保留外部工具和项目（Project）内容；同范围已有确认不重复索取。
- 投射成功不证明当前对话已加载资产。按当前工具的刷新提示继续；不可枚举的系统或插件技能（Skill）不因此被视为不存在。

产品入口技能（Skill）已可用时，后续采用其按需说明。任务（Task）、审查（Review）、验证（Verification）和工作摘要（Work Context）保存在本机 SQLite，复盘正文在本机文件中，不通过 Git 自动同步；不要读取、迁移或生成旧任务（Task）YAML。专业执行与交付仍使用对应技能（Skill）和真实工具，不把诊断或记录成功当作目标完成。
