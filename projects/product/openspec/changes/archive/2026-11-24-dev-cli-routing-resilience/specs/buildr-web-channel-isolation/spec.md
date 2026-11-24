## MODIFIED Requirements

### Requirement: 正式与开发桌面启动器必须采用 Buildr Development 命名并兼容平滑迁移旧入口
正式 npm Launcher MUST 以 `Buildr Development`（macOS 为 `Buildr Development.app`，Windows 为 `Buildr Development.lnk`）作为默认桌面入口，Development Launcher MUST 以 `Buildr Development Dev`（macOS 为 `Buildr Development Dev.app`，Windows 为 `Buildr Development Dev`）作为默认桌面入口，且均使用象形 `D` 启动器图标；两者 MUST 保持既有的平台数据根目录、Bundle 标识与 CLI 命令不变。状态检查、刷新与重新安装 MUST 兼容识别已存在的同所有权旧名入口（`Buildr Web` / `Buildr Web Dev` / `Buildr Dev`），并在新入口安装校验通过后安全清理可证明归属的旧入口，同时保留所有权不明的外部入口。开发启动器安装校验通过后 MUST 在对应开发数据目录原子写入或更新 `development-source.json` 稳定来源登记；卸载开发启动器时 MUST 同步移除归属匹配的 `development-source.json` 并保留所有权不可证明的记录。开发启动器安装与状态检查 MUST 只读检测配对发布版数据目录已登记全局 npm `buildr` 的路由发现兼容性，在不兼容时给出非阻断告警与更新指引，同时隔离数据目录检查 MUST NOT 泄漏或读取宿主真实安装登记。

#### Scenario: 正式启动器升级自动迁移旧名入口
- **WHEN** 本机仅存在同安装槽位的旧版 `/Applications/Buildr Web.app` 且用户执行默认安装或随更新刷新启动器
- **THEN** 系统 MUST 安装并验证新的 `/Applications/Buildr Development.app`
- **AND** MUST 移除可证明属于同一安装槽位的旧版 `Buildr Web.app`，同时保留无法证明归属的外部入口

#### Scenario: 开发启动器升级自动迁移旧名入口
- **WHEN** 用户在存在旧版可证明归属的 `Buildr Web Dev` 或 `Buildr Dev` 入口时执行开发启动器安装
- **THEN** 系统 MUST 生成并验证 `Buildr Development Dev` 入口、原子写入对应开发数据目录的 `development-source.json`，并安全清理上述已证明归属的旧开发入口
- **AND** 正式入口与所有权不明的外部目标 MUST 保持不受影响

#### Scenario: 卸载开发启动器时按归属清理稳定来源登记
- **WHEN** 用户卸载可证明归属的开发启动器且当前开发数据目录存在 `development-source.json`
- **THEN** 系统 MUST 同步移除归属匹配的 `development-source.json`
- **AND** 若 `development-source.json` 的所有权或指向目标无法证明属于本次被卸载入口，系统 MUST 保留该记录并输出诊断

#### Scenario: 检测到旧版全局 npm CLI 不兼容时非阻断预警
- **WHEN** 开发启动器安装或状态检查发现配对发布版数据目录登记的当前全局 npm `buildr` 路由器不支持当前开发来源发现协议
- **THEN** 系统 MUST 在状态结果中返回兼容状态与非阻断告警并附带更新指引，安装命令在向标准错误输出预警的同时 MUST 正常完成安装并保持标准输出结构化 JSON 完整
- **AND** 当检查运行在显式隔离的开发数据目录且配对发布版目录无登记时，MUST 返回缺省状态而不读取宿主真实安装登记
