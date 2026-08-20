## MODIFIED Requirements

### Requirement: released 与 development 普通 Web 实例必须隔离并存
每个 ordinary Web profile MUST独占自己的 `instance.json`、`instance-start.lock`、Workspace registry、instance secret与shutdown lifecycle。健康检查与协议相同 MUST NOT允许跨profile复用；同一profile内仍 MUST保持单实例。Development Launcher MUST使用固定默认端口`4458`且不得随机回退；Preview与不带Launcher identity的普通CLI MUST保持显式端口或随机loopback端口语义。released profile通过正式npm Launcher启动时 MUST使用binding中的closed端口策略，默认首选`4457`，并在非零首选端口因`EADDRINUSE`不可绑定时只回退一次随机端口。

#### Scenario: 两个Server同时启动
- **WHEN** released普通Web健康运行后启动development普通Web
- **THEN** 两者 MUST同时保持健康并拥有不同PID、loopback URL、instance文件和启动锁
- **AND** development MUST NOT返回released实例URL或向released registry写入Workspace

#### Scenario: 正式Launcher使用默认首选端口
- **WHEN** 新安装或从旧binding修复的正式npm Launcher启动released普通Web且`127.0.0.1:4457`可绑定
- **THEN** released实例 MUST监听`127.0.0.1:4457`并把实际URL写入matching instance receipt
- **AND** Development Launcher 的固定端口`4458`、Preview与普通CLI的端口语义 MUST保持不变

#### Scenario: Development Launcher使用固定端口
- **WHEN** 新安装或更新后的`Buildr Web Dev` Launcher启动development普通Web且`127.0.0.1:4458`可绑定
- **THEN** development实例 MUST监听`127.0.0.1:4458`并把实际URL写入development instance receipt
- **AND** Launcher MUST在同profile健康实例已存在时复用该实例，不得启动第二实例或切换到随机端口

#### Scenario: Development Launcher固定端口被占用
- **WHEN** `127.0.0.1:4458`被无法证明属于matching development profile的进程占用
- **THEN** Development Launcher MUST明确失败并保留占用者
- **AND** MUST NOT随机回退、扫描其他端口、强杀进程或把foreign服务登记为Buildr Web Dev

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
