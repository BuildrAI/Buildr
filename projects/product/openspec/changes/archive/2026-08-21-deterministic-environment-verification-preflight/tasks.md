## 1. 声明与环境模型

- [x] 1.1 扩展Project Verification v2 parser、identity、Doctor与fixtures，使capability可以可选引用同Project的Preparation Recipes，并拒绝越界Project、未知Service和缺失Recipe。
- [x] 1.2 引入带基础选择、capability辅助准备、typed Workspace path references与closed executable authority references的新Environment Plan writer，保留既有Plan的只读兼容和显式prepare升级路径。
- [x] 1.3 扩展Environment Receipt与compact execution route，保存并投射closed runtime invocation、解析后的typed paths和capability preparation closure，同时拒绝任意env、secret和机器事实进入portable声明。
- [x] 1.4 增加Domain/Application测试，证明辅助scope不改变Task Record scope、Change applicability、Content Target或源码写入所有权。

## 2. Verification准备闭包

- [x] 2.1 实现纯读Verification admission closure：按selected capability declaration identities合并、去重并核对matching Environment准备要求，返回绑定selected capability、closure、Plan/Receipt与runtime的稳定identity、专业gap分类和仅限可恢复preparation的closed恢复输入。
- [x] 2.2 让Task Verification workflow在preflight blocked时只通过Task Environment幂等prepare恢复同一Receipt，重跑admission后才打开execution record或启动capability副作用。
- [x] 2.3 更新Task Environment、Task Verification及相关入口Skills/capability contracts，确保Agent消费Receipt runtime/path facts而不手工转抄`BUILDR_NODE`、PATH、cwd或安装命令。
- [x] 2.4 增加Node与非Node fixtures，证明Buildr核心不扫描技术栈、不为未引用scope创建Node前置，Workspace外受管runtime由executable authority解析，并对runtime、Recipe、path与output漂移fail closed。
- [x] 2.5 增加admission identity竞态、专业gap分类与安全降级测试，证明preflight后漂移在首次副作用前停止、只有preparation gap进入Environment恢复，且Buildr不可用时不阻塞无关工作或产生Formal Result。

## 3. Buildr自举与发行边界

- [x] 3.1 为`product.browser-smoke`声明`buildr-web`辅助Preparation Recipe，并让Browser preflight从Task Environment允许根解析项目本地TypeScript/Vite，不借用全局或retained依赖。
- [x] 3.2 增加Browser集成测试，覆盖本地工具链current、只有全局TypeScript、Browser不适用及辅助Recipe失败，证明昂贵构建和Chrome均在preflight后启动。
- [x] 3.3 更新npm tarball、Launcher与发行版Web smoke，证明产品启动与Web负载只消费Host Node及随包`web-dist`，不读取Product preparation、源码依赖或手工`BUILDR_NODE`；同时Doctor与sync仍按契约读取目标用户Workspace authority。

## 4. 兼容性、知识与直接反馈

- [x] 4.1 覆盖既有无preparation reference的Verification declarations、旧Plan/Receipt只读、显式升级、重复prepare复用及selected capability变化的兼容场景。
- [x] 4.2 更新verification registry与affected ownership，使声明、Environment、Verification、Browser和package边界变化命中有界直接验证能力。
- [x] 4.3 根据`.buildr/knowledge-impact.yml`更新technical architecture、`buildr`/`buildr-web` Service说明与“验证准备闭包”术语，并重新核对Brief与最终实现一致。
- [x] 4.4 运行新增Unit/Contract/Integration/System及适用Browser直接反馈，修复delta specs、实现、声明、知识或测试发现的问题，并完成OpenSpec strict与convergence readiness检查。
