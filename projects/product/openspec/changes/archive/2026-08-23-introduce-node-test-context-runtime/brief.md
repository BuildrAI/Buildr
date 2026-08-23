# 引入可复用的 Node Test Context Runtime

## 一句话摘要

把 Buildr 私有的测试 seed helper 提升为可供未来 Node.js 项目复用的 Test Context Runtime，并由 Buildr Task Application 测试完成首个真实接入。

## 为什么需要

Buildr 已多轮优化测试选择、fixture和并发，但 Core 仍需数分钟。根因之一是 Node 测试文件和进程各自组装 Application、Workspace、SQLite 与清理环境，缺少类似 Spring TestContext 的配置签名缓存、持久执行宿主和统一隔离/reset协议。继续新增局部helper只会增加另一套生命周期责任。

## 交付边界

公共内核位于发布源码并通过稳定npm子路径提供，拥有Context定义、依赖、scope、cache、lease、并发、reset、dirty/evict和事件；Node adapter拥有测试注册与持久Worker Host；Buildr专用provider留在test边界。Vitest/Jest不是前置条件，未来只能复用该Runtime。

Buildr首个纵切复用Task Application Runtime与不可变Workspace seed，每个case仍取得隔离sandbox。CLI、Git、跨进程SQLite、Workspace初始化、Finish、自举、cleanup与Release若是主证据，继续执行真实生命周期。

## 验收

需要证明非Buildr项目可独立使用公共入口；同一Host内相同配置只create一次；多Host并行不超过outer grant；dirty、失败和cleanup不会污染后续测试；Task owner获得可复核收益；Core/Candidate/Release覆盖不缩水。无法达到180秒时继续报告真实长尾，不以框架存在或删减证据宣称完成。
