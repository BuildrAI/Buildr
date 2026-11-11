## 1. 凭据开关
- [x] 1.1 ProgrammaticCredential 增加 allowFullAccess（默认 true），create 接受并校验，旧记录读取归一化
- [x] 1.2 新增按已观察修订切换 allowFullAccess 的存储方法与管理路由 POST :id/full-access（仅网页会话）
## 2. 程序入口与文档
- [x] 2.1 发现透传连接 capabilities.permissionModes，去除硬编码 default
- [x] 2.2 准入按凭据 allowFullAccess 门禁 full-access（关闭 403），省略按 schema 通用钉 default，仍拒 cwd/越权 taskLinks
- [x] 2.3 OpenAPI permissionMode 改为 enum 并说明凭据门禁；/help、example.py、操作描述同步
## 3. 前端
- [x] 3.1 API 客户端增加 allowFullAccess 与 update；创建弹窗开关；凭据卡片开关与切换处理
## 4. 验证与交付
- [x] 4.1 集成测试覆盖 full-access 受理、关闭 403、发现透传、OpenAPI enum、开关切换
- [x] 4.2 前端逻辑测试覆盖 update 客户端与开关
- [x] 4.3 buildr/buildr-web 静态检查与单元测试、相关集成通过
- [x] 4.4 部署本机开发版 127.0.0.1:4458 并核对 GrokBot allowFullAccess 开启、full-access 受理与关闭 403
- [x] 4.5 按 task-finish 收尾：清理开发环境、集成并推送代码，报告接口变更与提交 id