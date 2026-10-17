## MODIFIED Requirements

### Requirement: 专用实例复用与回收

Codex MUST 首次调用才启动自有服务进程并复用，每个登记最多一个存活自有进程。DSH MUST 仅连接正在运行且身份匹配的桌面后台，MUST NOT 启动独立 DSH 生成进程或回退。两者 MUST 按登记串行执行；Codex 完全空闲 1 小时 MUST 释放自有实例，DSH 完全空闲 30 分钟 MUST 释放连接，排队和执行不计空闲，查询不延长空闲。再次请求 Codex 可重建自有实例，DSH 只能重新连接已确认桌面。

Buildr 退出 MUST 停止新请求并有界清理自身资源。DSH MUST 只取消本连接拥有的请求和断开，不能关闭桌面或全局取消其他工作。Codex 重启及取消无法确认 MUST 有界关闭自有进程，退出未确认禁止替代启动。准备及等待计入预算，不重放已接受请求。浏览器关闭不等于 Buildr 退出。

#### Scenario: 空闲后继续生成
- **WHEN** Codex 自有实例完全空闲 1 小时或 DSH 连接完全空闲 30 分钟释放后再次请求
- **THEN** Codex MUST 可重新启动，DSH MUST 核对并重连桌面，保留登记和说明

#### Scenario: Codex 空闲未满一小时
- **WHEN** Codex 自有实例完全空闲已满 30 分钟但未满 1 小时，期间只有查询
- **THEN** 系统 MUST 保留该实例，并在连续完全空闲满 1 小时后释放

#### Scenario: DSH 空闲后继续生成
- **WHEN** DSH 连接完全空闲 30 分钟释放后再次请求
- **THEN** DSH MUST 核对并重连桌面，保留登记和说明

#### Scenario: 两次生成复用实例
- **WHEN** 同一登记连续生成
- **THEN** 系统 MUST 复用同一专用实例或桌面连接串行处理，不为连续生成新增进程

#### Scenario: 退出清理
- **WHEN** Buildr 退出
- **THEN** 系统 MUST 有界释放自有资源，桌面和其他聊天保持

#### Scenario: 默认配置需要重启
- **WHEN** Codex 后续请求的配置必须重启生效且仍有执行
- **THEN** 系统 MUST 等待、关闭旧自有进程并启动新进程，不并行保留策略实例且不超预算
