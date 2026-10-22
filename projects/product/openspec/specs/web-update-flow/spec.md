# web-update-flow Specification

## Purpose
定义 Buildr Web 页面内分阶段更新的任务语义：钉住用户确认的精确版本、后台下载准备、二次确认后安装与实例交接，使页面更新期间本机保持可用、重启中断保持秒级。

## Requirements

### Requirement: 更新任务必须钉住用户确认的精确版本

分阶段更新任务 SHALL 以 prepare 输入中的 `track` 与 `expectedVersion` 建立唯一目标版本。执行下载前 MUST 重新核对 npm registry 当前发布事实；所选轨道当前可安装的版本 MUST 与 `expectedVersion` 完全一致，否则 MUST 以版本冲突拒绝且不产生任何下载或安装副作用。任务 MUST NOT 切换轨道、降级或安装与用户确认不一致的版本。

#### Scenario: 版本一致时进入下载

- **WHEN** `expectedVersion` 是有效 semver、高于当前安装版本且与所选轨道 registry 当前报告的可安装版本一致
- **THEN** 任务 MUST 钉住该版本进入后台下载
- **AND** MUST NOT 改用其他版本或轨道

#### Scenario: registry 事实已漂移

- **WHEN** prepare 时 registry 报告的所选轨道版本与 `expectedVersion` 不一致
- **THEN** 任务 MUST 以版本冲突拒绝且不产生副作用
- **AND** 冲突结果 MUST 携带 registry 当前版本事实供页面刷新详情

#### Scenario: 无效或不可安装目标

- **WHEN** `expectedVersion` 不是有效 semver、不高于当前安装版本或所选轨道当前不可安装
- **THEN** 任务 MUST 拒绝进入下载并返回明确阻塞原因

### Requirement: 后台准备必须异步且可观察

更新任务的下载准备 MUST 异步执行，prepare 请求 MUST 在校验通过后立即返回任务快照，不得持有请求等待下载完成。任务状态 MUST 覆盖 `idle`、`preparing`、`ready`、`failed`、`applying` 与完成语义，状态读取 MUST 返回真实快照，不得伪造进度或成功。同一时刻全实例只允许一个更新任务；已有任务处于 `preparing` 或 `applying` 时新的 prepare MUST 冲突拒绝，`ready`、`failed` 或 `idle` 状态下新的 prepare MUST 可重新开始。

#### Scenario: 准备期间页面可继续使用

- **WHEN** 更新任务处于 `preparing`
- **THEN** 本机 Buildr Web 的其他页面请求与功能 MUST 照常响应
- **AND** 下载过程 MUST NOT 阻塞 HTTP 服务

#### Scenario: 下载完成后就绪待确认

- **WHEN** 后台下载成功落盘
- **THEN** 任务状态 MUST 转为 `ready` 并携带已钉住的目标版本
- **AND** MUST 保持等待用户确认，不自动进入安装

#### Scenario: 下载失败如实报告

- **WHEN** 后台下载因网络、权限或 registry 原因失败
- **THEN** 任务状态 MUST 转为 `failed` 并携带错误代码与原因
- **AND** MUST 允许用户重新发起 prepare

#### Scenario: 任务进行中拒绝重复准备

- **WHEN** 已有任务处于 `preparing` 或 `applying` 状态时收到新的 prepare 请求
- **THEN** MUST 返回任务忙冲突且不改变现有任务

### Requirement: 应用必须使用已钉住版本复用既有安装与交接语义

apply 请求 MUST 携带 `expectedVersion` 且与当前 `ready` 任务钉住的版本一致，不一致时 MUST 冲突拒绝且不产生副作用。通过校验后 MUST 先建立响应再执行安装与交接；安装 MUST 使用与 CLI 更新相同的 receipt 绑定 updateAuthority（Host Node、npm CLI 与 prefix）安装同一 `@buildr-ai/buildr` package 的钉住版本，随后 MUST 经既有网页交接端口完成同槽位旧实例的认证退出、启动锁接管与健康核验。apply MUST NOT 创建 Launcher、形成第二安装渠道或跳过交接身份核对。

#### Scenario: 版本匹配时进入安装

- **WHEN** 当前任务为 `ready` 且 apply 的 `expectedVersion` 与钉住版本一致
- **THEN** MUST 先返回已受理响应再异步执行安装与交接
- **AND** 安装 MUST 使用 receipt 绑定的 updateAuthority 完成精确版本安装

#### Scenario: 版本不匹配拒绝

- **WHEN** apply 的 `expectedVersion` 与钉住版本不一致，或当前无 `ready` 任务
- **THEN** MUST 返回冲突且不执行安装或交接

#### Scenario: 交接后旧进程退出

- **WHEN** 安装成功且既有交接端口接管旧实例
- **THEN** 旧实例 MUST 按既有 `--update-handoff` 语义由新版进程认证退出并交出端口
- **AND** MUST NOT 强杀旧实例或伪造重启结论

### Requirement: 网页更新入口只对可证明安装来源开放，开发来源仅执行模拟

分阶段更新任务的真实下载、安装与交接 MUST 仅在当前安装来源可证明为 npm registry package 时执行；来源判断 MUST 复用与 CLI 更新相同的 installation origin 识别，不得凭页面参数、PATH 或目录外观决定。development checkout MUST 仅执行本地模拟更新：状态机流转与版本钉住保持真实，但 MUST NOT 查询 registry、执行安装子进程、改动安装文件或触发网页交接。unknown 来源与 Preview 实例 MUST 拒绝写入口且不产生副作用。

#### Scenario: npm 安装来源接受更新

- **WHEN** 当前来源经 installation origin 证明为 npm registry package
- **THEN** 更新任务 MUST 允许进入准备流程

#### Scenario: development checkout 仅执行模拟更新

- **WHEN** 当前来源经 installation origin 证明为 development checkout
- **THEN** prepare 与 apply MUST 按同一状态机流转进入 `preparing→ready→applying→completed`
- **AND** MUST NOT 查询 registry、执行 npm 子进程、改动 checkout 文件或调用网页交接

#### Scenario: 未知来源与 Preview 拒绝更新

- **WHEN** 当前来源为 unknown，或实例为 Preview
- **THEN** prepare 与 apply MUST 拒绝并返回不支持的明确原因
- **AND** MUST NOT 产生下载、安装、模拟或交接副作用
