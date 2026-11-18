# buildr-development-mode Specification

## Purpose

定义 Buildr 产品开发 checkout 的 `buildr dev` 热更新模式：在 development profile 下同时运行四个服务，前端通过 Vite 热更新，后端按改动单独重启，并与交付激活、发布版页面和预览实例保持隔离。

## Requirements

### Requirement: buildr dev 必须同时运行四个服务的活版本

系统 MUST 提供一条 `buildr dev` 开发命令，在 development profile 的既有数据根运行四个服务的活版本。主入口 MUST 默认固定为 4458，并在同一入口提供主页面、`/harness/`、API 与热更新，不要求另开前端端口。独立 Harness MUST 提供显式开发源码选项，在其 development 入口默认 9519 提供热更新并保留独立认证。开发模式 MUST NOT 生成交付证明。

#### Scenario: 启动开发模式
- **WHEN** 用户在开发 checkout 执行 `buildr dev`
- **THEN** 系统 MUST 认证已有 development 实例后协调启动同源开发入口
- **AND** 未知归属或不可认证的端口占用 MUST 被保留并准确报告，不自动换端口掩盖失败

#### Scenario: 修改前端
- **WHEN** 任一前端源码变化或出现编译错误
- **THEN** 系统 MUST 在网页层更新或报告错误，并在修正后自动恢复
- **AND** MUST NOT 因此重启宿主、模型执行或等待回答

#### Scenario: 修改 buildr 后端
- **WHEN** Buildr 后端变化
- **THEN** 系统 MUST 合并连续保存并串行准备最新内容，只协调宿主更新
- **AND** Harness 原运行与执行 MUST 保留，前端连接自动恢复

#### Scenario: 修改 harness 后端
- **WHEN** Harness 后端变化
- **THEN** 系统 MUST 重建并交接运行单元，保留旧执行
- **AND** 契约变化 MUST 自动执行必要生成与宿主更新，不能默认依赖人工补重启

### Requirement: 开发模式必须与交付和预览隔离

系统 MUST 保持正式构建、发布入口和预览实例行为；独立 Harness 的热更新只在显式开发选项下启用。开发模式 MUST NOT 扫描、停止、接管或删除预览实例及其数据；预览 MUST 继续独立端口和候选生产构建，保持启动时配置复用与显式刷新语义。开发监听与正式开发安装 MUST 协调更新窗口，不并发替换同一 development 运行。

#### Scenario: 预览实例正在运行
- **WHEN** 开发模式启动、更新或退出
- **THEN** 预览 MUST 保持自己的数据根、端口和候选产物
- **AND** 开发模式 MUST NOT 扫描、停止或删除预览

#### Scenario: 正式激活与开发监听相遇
- **WHEN** 正式激活占用同一开发来源的更新窗口
- **THEN** 开发监听 MUST 暂停相关准备与替换，不争抢端口或改写其结果
- **AND** 结束后 MUST 核对当前实例归属再恢复，未知或不同归属 MUST 保留并报告

#### Scenario: 退出开发模式
- **WHEN** 用户退出开发模式
- **THEN** 系统 MUST 确认停止本次拥有的网页与监听资源
- **AND** MUST NOT 删除开发数据、正式交付记录或误停已由其他入口接管的实例

#### Scenario: 预览候选构建
- **WHEN** 预览准备候选产物
- **THEN** 开发适配 MUST NOT 进入生产构建或使其依赖运行中的开发服务器

### Requirement: 开发会话只用于本机开发

开发页面 MUST 使用其宿主自己的页面认证，不从其他端口抓取或转移会话；API、源码资源与热更新连接 MUST 保持准确的本机来源约束。开发 HTML 必要的安全策略调整 MUST 限定显式开发模式；发布和预览 MUST 保持原策略。

#### Scenario: 开发页面加载
- **WHEN** 浏览器访问主页面、嵌入 Harness 或独立 Harness 的开发资源
- **THEN** 系统 MUST 执行相应宿主认证及来源检查
- **AND** 跨源或未授权请求 MUST NOT 因开发适配绕过原边界

### Requirement: 开发更新失败必须保留可恢复运行并报告真实版本

后端更新 MUST 先准备与检查再协调替换；准备失败 MUST 保留原可用运行，启动失败 MUST 尝试从已保留的上一份可运行代码恢复，不回滚用户源码、依赖或数据库。系统 MUST 报告目标和实际采用版本；超时或连接中断 MUST 重新观察，不能直接宣称旧版保留或盲目重放业务写入。旧模型执行、后台工具和等待回答 MUST 继续归原代次维护。

#### Scenario: 错误保存后修复
- **WHEN** 后端候选存在准备或导入错误
- **THEN** 原运行 MUST 保留，修复后 MUST 自动准备新候选

#### Scenario: 候选启动失败
- **WHEN** 预检查通过但启动失败
- **THEN** 系统 MUST 尝试恢复上一份可运行代码并分别报告原失败与恢复结果
- **AND** 恢复失败 MUST 明确报告，不能显示更新成功

#### Scenario: 结果未知或原执行仍活跃
- **WHEN** 切换返回超时或旧代次仍有工作
- **THEN** 系统 MUST 核对实际代次与目标，保留原工作和未知结果，不自动重发业务写入
