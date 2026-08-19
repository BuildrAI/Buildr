## MODIFIED Requirements

### Requirement: released 与 development 普通 Web 实例必须隔离并存
每个 ordinary Web profile MUST独占自己的 `instance.json`、`instance-start.lock`、Workspace registry、instance secret与shutdown lifecycle。健康检查与协议相同 MUST NOT允许跨profile复用；同一profile内仍 MUST保持单实例。development profile、Preview与不带npm Launcher binding的普通CLI MUST保持现有显式端口或随机loopback端口语义；released profile通过正式npm Launcher启动时 MUST使用binding中的closed端口策略，默认首选`4457`，并在非零首选端口因`EADDRINUSE`不可绑定时只回退一次随机端口。

#### Scenario: 两个Server同时启动
- **WHEN** released普通Web健康运行后启动development普通Web
- **THEN** 两者 MUST同时保持健康并拥有不同PID、loopback URL、instance文件和启动锁
- **AND** development MUST NOT返回released实例URL或向released registry写入Workspace

#### Scenario: 正式Launcher使用默认首选端口
- **WHEN** 新安装或从旧binding修复的正式npm Launcher启动released普通Web且`127.0.0.1:4457`可绑定
- **THEN** released实例 MUST监听`127.0.0.1:4457`并把实际URL写入matching instance receipt
- **AND** development profile与普通CLI的端口默认值 MUST保持不变

#### Scenario: 正式Launcher首选端口被占用
- **WHEN** 正式npm Launcher binding声明非零首选端口且真实listen返回`EADDRINUSE`
- **THEN** Buildr MUST在同一个start lock内关闭未就绪server并只以端口`0`重试一次
- **AND** MUST记录回退原因和最终URL，且 MUST NOT复用占用端口的未知进程、扫描其他固定端口或启动第二个released实例

#### Scenario: 正式Launcher显式选择端口或随机端口
- **WHEN** 用户通过`buildr web launcher install|repair --port <port>`创建或更新正式Launcher
- **THEN** binding MUST把`0..65535`中的选择纳入closed identity，省略参数时 MUST使用`4457`，`0` MUST直接请求随机端口
- **AND** `repair`省略端口时 MUST保留已有current策略，旧binding迁移时 MUST采用默认`4457`

#### Scenario: 复用旧健康released实例
- **WHEN** matching released profile已有健康实例且其实际端口不同于当前Launcher binding策略
- **THEN** Launcher MUST复用该健康实例并打开其实际URL
- **AND** MUST NOT为了迁移端口自动停止实例或并行启动第二个released实例

#### Scenario: 退出一个实例
- **WHEN** 用户通过认证退出动作停止development实例
- **THEN** Buildr MUST只清理matching development receipt并停止该PID
- **AND** released实例、receipt、registry与session MUST保持不变

#### Scenario: 旧shared-root实例属于另一channel
- **WHEN** released Root中的旧instance receipt或health identity可证明属于development
- **THEN** released启动 MUST拒绝复用、覆盖、停止或清理该健康实例
- **AND** 诊断 MUST要求先通过旧实例公开退出动作停止，再分别启动两种profile

## ADDED Requirements

### Requirement: 正式 npm Launcher 必须支持重复打开
macOS正式npm Launcher MUST把App executable保持为短生命周期入口。它 MUST在同步校验binding、Host Node、package entry及其digest后启动独立后台运行器并退出；后台运行器 MUST执行同一binding中的npm entry、追加正式Launcher日志，并在失败时保留可见诊断。Launcher MUST NOT复制Node、Buildr package或payload，也 MUST NOT把development checkout作为正式入口。

#### Scenario: 首次打开正式Launcher
- **WHEN** 用户打开已安装且binding current的macOS正式Launcher且不存在健康released实例
- **THEN** App executable MUST在启动后台运行器后及时退出，后台运行器 MUST启动matching released实例
- **AND** LaunchServices MUST NOT因Web进程持续运行而把App executable保持为不可重开的前台进程

#### Scenario: 重复打开正式Launcher
- **WHEN** matching released实例已经健康且用户再次打开macOS正式Launcher
- **THEN** 新的短生命周期入口 MUST成功执行并由CLI复用该实例、打开其实际URL
- **AND** 启动 MUST不返回LaunchServices `-600`、不创建第二实例或切换到development profile

#### Scenario: Launcher同步校验失败
- **WHEN** binding、Host Node、package entry或digest在后台启动前不再匹配
- **THEN** App executable MUST拒绝启动后台运行器并写入正式Launcher日志
- **AND** MUST显示从同一npm installation运行`buildr web launcher status|repair`的修复提示

#### Scenario: 后台运行器启动失败
- **WHEN** 同步preflight通过但正式Web命令以非零状态退出
- **THEN** 后台运行器 MUST记录退出状态并显示启动失败诊断
- **AND** App executable短生命周期与下一次可重开能力 MUST保持不变
