## 1. Root 与产品身份模型

- [x] 1.1 新增 shared Product Data Root 与 channel-scoped Web Data Root abstraction，以 installation channel/runtime role解析released/development profile，并保持`BUILDR_APP_DATA_DIR`最高优先级
- [x] 1.2 为macOS、Windows、Linux默认路径、unknown/不一致身份和显式override补充纯逻辑单元测试
- [x] 1.3 将Workspace registry、普通instance和start lock迁移到同一resolved Web Root，同时保持product installation/release与Preview Root边界

## 2. Workspace双重管理保护

- [x] 2.1 实现canonical real root、Workspace UUID、对侧registry与`.buildr/local/web-management.json`的closed management identity及锁定检查
- [x] 2.2 让CLI `web --target`、Launcher和Workspace注册API共用registration fence，并支持在不打开SQLite的情况下移除错误registry条目
- [x] 2.3 在Structured Store central open的`DatabaseSync`之前接入只读检查/写入claim，覆盖symlink、反向channel、registry缺失/损坏和candidate writer边界
- [x] 2.4 增加SQLite hash、mtime、migration ledger零变化的migration前阻断测试

## 3. 双普通Web实例与Launcher

- [x] 3.1 扩展instance receipt与health profile identity，只在同channel Root内复用、等待、清理和退出实例
- [x] 3.2 增加released/development两个HTTP Server并行启动、不同PID/URL、跨channel不复用和独立退出的System测试
- [x] 3.3 更新Development Launcher build/manage/install，使其自动使用development profile、验证Launcher/Server identity并在幂等重装时只处理development实例
- [x] 3.4 补充Development Launcher环境/identity/幂等测试，并在临时install root执行macOS真实Launcher wrapper smoke，确认不覆盖用户npm/development Launcher或released instance

## 4. Doctor、兼容性与回归

- [x] 4.1 让Doctor/status从shared installation inventory与两套Web Root分别投影npm/development安装、Data Root和instance身份
- [x] 4.2 补充发布版旧Root/registry兼容、development空registry、双安装双实例和旧shared-root instance诊断测试
- [x] 4.3 运行Workspace registry、local-app runtime/HTTP、Launcher、Preview、Doctor及public JSON contract的focused/affected测试并修复回归
- [x] 4.4 更新受影响的Buildr Service/technical architecture当前认知、Brief和knowledge impact evidence，并完成strict validation与apply前语义预检
