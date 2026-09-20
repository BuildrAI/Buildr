## MODIFIED Requirements

### Requirement: Buildr Browser verification必须消费声明的Web工具链准备
Buildr Browser验证适用时，智能体（Agent）与项目入口 MUST依据当前`preparation.yml`、真实构建入口和本机依赖事实，在staging build或Chrome启动前确认`buildr-web`的锁定依赖与项目本地TypeScript executable可用。Browser verifier MUST NOT借用全局TypeScript、retained checkout `node_modules`或未登记目录；MUST不依赖已退役的Verification capability preparation reference、统一Environment状态或preparation closure。

#### Scenario: Buildr Web本地工具链current
- **WHEN** Browser检查被选择且当前`buildr-web`工作根已具有匹配的本地依赖
- **THEN** staging build MUST从Agent核对的Buildr Web实际工作根解析项目本地TypeScript与Vite
- **AND** browser preflight通过后才能构建staging dist和启动Chrome

#### Scenario: 只有全局TypeScript可用
- **WHEN** Buildr Web本地依赖缺失，但系统PATH存在另一版本TypeScript
- **THEN** Browser verification MUST在构建前报告当前工作根的依赖缺口，并指向项目拥有的准备入口
- **AND** MUST不使用全局TypeScript继续执行或把版本差异报告为页面失败

#### Scenario: Browser capability不适用
- **WHEN** changed target没有选择Browser检查
- **THEN** MUST不为该未选择的检查安装Buildr Web依赖、构建staging dist或启动Chrome
- **AND** 其他适用检查的真实依赖 MUST继续由各自入口处理
