# 接口与管理信息保全

本程序使用明确的 `apiBaseUrl`，不把网站地址当作服务地址。Nacos 从 3.0 起将网站与管理接口分离，默认分别使用 8080 与 8848；实际部署可改端口及根路径，程序不据此猜测。依据：[官方部署说明](https://nacos.io/en/docs/v3.0/manual/admin/deployment/deployment-overview/)。

## 第三版正文详情与完整管理详情

Nacos 3.1.1 的第三版管理接口（API v3）读取返回 `ConfigDetailInfo`，继承 `ConfigBasicInfo`；它包含正文、格式、应用名、说明及标签，没有旧管理字段 `use/effect/schema`。缺少这些字段不证明远端原值为空。发布请求省略它们时，Nacos 的更新实现会将对应数据库字段写成空值，包括比较并交换（CAS）路线。因此不能仅凭 v3 正文详情执行完整配置更新。

本程序的 v3 读取仍使用正式正文接口；发布前另读明确的 `/v1/cs/configs?show=all` 管理兼容路线，取得 `ConfigAllInfo`。严格核对 `dataId/group/tenant/content/md5`、`createTime/modifyTime` 的必需模型结构及目标，拒绝将 v3 的封装或正文模型当作完整管理响应。兼容路线不存在、被禁用、不可读或模型残缺时，不发布；正常正文读取保留。

在这条完整管理路线中，可选 `appName/desc/configTags/use/effect/schema` 的值可以是字符串或明确的 `null`。官方序列化使用 `NON_NULL`，因此已确认模型的可选字段也可能省略；此时按该模型的空值语义处理。该语义不适用于 v3 正文详情或未知模型。发布保留完整观察，回读分别检查正文、格式和这些字段；`verified` 必须三者都通过。

主要依据为官方 3.1.1 源码：

- [第三版返回模型 ConfigBasicInfo](https://github.com/alibaba/nacos/blob/3.1.1/api/src/main/java/com/alibaba/nacos/api/config/model/ConfigBasicInfo.java) 与 [ConfigDetailInfo](https://github.com/alibaba/nacos/blob/3.1.1/api/src/main/java/com/alibaba/nacos/api/config/model/ConfigDetailInfo.java)。
- [旧管理兼容路线 ConfigController](https://github.com/alibaba/nacos/blob/3.1.1/config/src/main/java/com/alibaba/nacos/config/server/controller/ConfigController.java#L255-L275) 与 [完整模型 ConfigAllInfo](https://github.com/alibaba/nacos/blob/3.1.1/config/src/main/java/com/alibaba/nacos/config/server/model/ConfigAllInfo.java)。
- [官方空值省略规则 JacksonUtils](https://github.com/alibaba/nacos/blob/3.1.1/common/src/main/java/com/alibaba/nacos/common/utils/JacksonUtils.java#L41-L46)。
- [发布字段处理 ConfigOperationService](https://github.com/alibaba/nacos/blob/3.1.1/config/src/main/java/com/alibaba/nacos/config/server/service/ConfigOperationService.java#L285-L293) 与 [更新字段 ConfigInfoMapper](https://github.com/alibaba/nacos/blob/3.1.1/plugin/datasource/src/main/java/com/alibaba/nacos/plugin/datasource/mapper/ConfigInfoMapper.java#L481-L503)。

第一版和第二版接口（API v1 / v2）继续使用既有完整管理详情保留元数据（Metadata），不要求旧系统不存在的可选字段。原生比较并交换（CAS）仅按已确认稳定版本启用，其他版本采用明确说明竞争窗口的写前再次读取；不因此把不支持原子更新误写成不可读取。离线模拟覆盖上述协议，不代表真实部署、全部服务版本或业务生效已验证。
