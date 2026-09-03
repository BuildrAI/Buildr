## MODIFIED Requirements

### Requirement: Browser verification 必须只读校验冻结的 web-dist
Buildr Product Browser verification MUST在系统临时目录使用当前Buildr Web source与锁定依赖生成staging dist，校验其普通文件集合、类型、资源闭包和生成物manifest后，MUST让隔离Buildr Web HTTP Server直接托管该matching staging dist运行受影响selector。验证 MUST NOT读取、比较、删除、覆盖或新增checkout中的本地`web-dist`，完成或失败后 MUST只清理本次拥有的staging root。

#### Scenario: staging dist 与 tracked web-dist 一致
- **WHEN** 当前Buildr Web source成功生成闭合且可验证的staging tree
- **THEN** Browser verification MUST使用该tree启动production-hosted Browser smoke
- **AND** 完成或失败后 MUST清理测试拥有的staging root并保持Git tree不变

#### Scenario: Web source 与 tracked web-dist 漂移
- **WHEN** staging build失败、包含不支持的entry、缺少入口/资源或manifest与实际bytes不同
- **THEN** Browser verification MUST在启动Chrome前失败并报告有界的build diagnostic
- **AND** MUST NOT回退到本地`web-dist`、tracked历史产物或Vite dev server

#### Scenario: checkout存在陈旧本地web-dist
- **WHEN** ignored `services/buildr/web-dist`存在与当前源码不一致的陈旧文件
- **THEN** Browser verification MUST仍只托管本次隔离生成的staging dist
- **AND** 陈旧本地输出 MUST不影响结果且不得被验证过程修改
