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
- **AND** SHALL 在用户已确认完整更新时自动接续安装；仅准备请求继续等待应用确认

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

### Requirement: 顶部入口必须按更新事实显示并以原图标表达连接

应用壳 SHALL 将主动检查放在更多菜单；没有可安装更新、活动更新或待恢复事项时 SHALL 不显示独立更新图标。独立图标 MUST NOT 叠加状态点。智能体（Agent）连接状态 SHALL 通过既有图标的点和线着绿色或灰色表达，内部留白 MUST 保留。更新窗口 SHALL 清楚区分当前版本、目标版本、下载、安装确认与后续结果；没有真实总量时 MUST NOT 展示虚假下载百分比。

#### Scenario: 无更新时检查仍可发现
- **WHEN** 自动检查没有可安装更新且没有待处理任务
- **THEN** 顶部 SHALL 隐藏独立更新图标，用户仍可通过更多菜单检查更新

#### Scenario: 候选版发现正式版
- **WHEN** 正式版版本高于当前候选版
- **THEN** 页面 SHALL 显示正式版更新，选中后的下载与安装 MUST 使用该正式版精确版本

### Requirement: 更新记录必须跨实例接续且独立核验结果

更新任务 SHALL 保留任务身份、安装范围、精确目标和已观察阶段，使新版实例能够接续。快照 MUST 区分软件已安装、启动入口可用、网页已连接和实际运行版本；MUST NOT 因页面连接恢复或磁盘软件包被替换而声称当前进程已经运行目标版本。同一任务的阶段写入 SHALL 检查已观察记录版本，冲突 MUST 显式失败且保留他人结果。

#### Scenario: 安装成功后旧进程结束
- **WHEN** 新版服务读取到同一安装范围中的进行中更新
- **THEN** SHALL 结合本进程的可信版本和启动入口结果接续展示，且不重复下载或安装

#### Scenario: 恢复到旧版网页
- **WHEN** 重新连接后当前进程版本与目标不同
- **THEN** SHALL 显示版本尚未恢复，MUST NOT 显示更新完成

### Requirement: 启动入口失败必须局部恢复

安装阶段 SHALL 检查并刷新已有且归属匹配的桌面启动入口；未安装时 SHALL 跳过，归属无法确认时 MUST NOT 覆盖。软件包安装成功且网页恢复后，启动入口失败 SHALL 作为部分成功展示。用户可请求修复该入口或重新连接；恢复 MUST 核对任务身份和精确版本，沿用同一安装归属，且 MUST NOT 将局部故障退回重新下载或静默更换版本。服务不可达时页面 SHALL 保留可读的等待和恢复指引。

#### Scenario: 仅启动入口失败
- **WHEN** 目标版本已运行，但桌面启动入口更新失败
- **THEN** SHALL 明示新版网页可继续使用，并提供独立修复；修复 MUST NOT 重新安装软件包

#### Scenario: 入口与网页均需恢复
- **WHEN** 软件包已安装，但启动入口失败且网页未恢复
- **THEN** SHALL 分别展示两项未完成事实，并保留等待和按顺序恢复的方法

#### Scenario: 恢复期间目标发生变化
- **WHEN** 恢复请求任务身份、版本或安装范围与当前观察不一致
- **THEN** MUST 拒绝产生恢复副作用，并说明实际冲突

#### Scenario: 开发与预览保持隔离
- **WHEN** 操作来自开发来源或预览实例
- **THEN** 开发来源 SHALL 仅模拟新增阶段，预览实例 SHALL 拒绝更新恢复写入，二者 MUST NOT 修改真实安装或启动器

### Requirement: 完整更新自动准备全部登记空间并支持局部恢复
用户确认完整更新后 SHALL 自动完成下载、精确安装、已有启动器维护、网页交接及本安装来源全部已登记空间的资源采用、入口生成和诊断。记录 MUST 跨进程保存目录身份与逐项结果。部分失败 MUST 保留成功结果并允许单项或全部失败重试；重试 MUST NOT 重复安装软件。开发模拟及预览隔离继续生效。

#### Scenario: 所有空间可访问
- **WHEN** 用户确认更新且安装、交接及所有空间准备成功
- **THEN** MUST 显示全部空间可使用新版

#### Scenario: 部分目录失败
- **WHEN** 一个目录不可访问或存在内容冲突
- **THEN** MUST 继续其他目录，显示软件已更新及待完成目录；重试 MUST 重新核对现场并仅接续未完成项

#### Scenario: 新实例恢复
- **WHEN** 新版进程读取未完成记录且可信运行版本匹配
- **THEN** MUST 接续工作空间准备，不能将恢复连接等同于全部完成
