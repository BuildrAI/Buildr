## REMOVED Requirements

### Requirement: 可选单向状态通知
**Reason**: 全局七类公共事件通知由按凭据的五类事件回推（`programmatic-event-pushback`）取代，推送范围按凭据接手标记隔离。
**Migration**: 既有接收地址与密钥迁移到 GrokBot 凭据回推设置（停用）；外部程序改用 `GET .../events` 补查与按凭据回推。

### Requirement: 隔离及有界尽力发送
**Reason**: 全局无限重试投递由按凭据的有界退避投递（10/30/90/270/810 秒、最多 5 次、未送达标记）取代。
**Migration**: 投递语义见 `programmatic-event-pushback` 的有界退避投递与持久化补查要求。

### Requirement: 单一私有配置
**Reason**: 全局单一私有配置文件由每凭据回推配置取代。
**Migration**: 既有 `~/.buildr-webhook.json` / `BUILDR_AGENT_WEBHOOK_CONFIG` 的地址与密钥迁移到 GrokBot 凭据回推设置（停用）。

### Requirement: 统一发送方身份
**Reason**: 发送方身份并入按凭据回推事件的 machine 字段（id 为本机稳定标识、name 为主机名）。
**Migration**: 见 `programmatic-event-pushback` 五类事件与内容要求。

### Requirement: 本机通知配置管理
**Reason**: 全局「事件通知」页签与其管理面移除，配置管理收敛到每个程序接入凭据下。
**Migration**: 见 `programmatic-agent-access` 凭据回推配置管理要求。