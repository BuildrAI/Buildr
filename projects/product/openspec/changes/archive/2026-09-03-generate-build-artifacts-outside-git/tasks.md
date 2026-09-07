## 1. 生成物基础

- [x] 1.1 为DTO、Test Context和Web builder增加显式输出目标，并实现排序文件清单、mode/size/SHA-256与无绝对路径的生成物manifest
- [x] 1.2 增加双临时目录重复生成测试，覆盖确定性、非法entry、manifest/bytes漂移和owner-bound cleanup
- [x] 1.3 扩展Buildr TypeScript检查范围到全部`tools/**/*.ts`，让干净检出先生成所需类型再执行严格no-emit检查

## 2. DTO与公共Test Context

- [x] 2.1 将全部HTTP DTO生成器改为可向两端ignored目录或显式暂存生成，并让contract/typecheck/build从无生成文件的状态成功
- [x] 2.2 将Test Context ESM/`.d.ts`改为本地ignored或Candidate暂存输出，调整public facade、exports检查与JavaScript/TypeScript consumer测试
- [x] 2.3 增加tracked-source门禁并删除两端tracked DTO与`package/targets/test-context`编译输出

## 3. Buildr Web与Browser

- [x] 3.1 调整Vite与Buildr Web构建入口：本地默认物化ignored `web-dist`，调用方可显式指定隔离输出
- [x] 3.2 让Browser verifier直接校验并托管本次staging dist，覆盖陈旧本地dist不影响结果和全部owned阶段清理
- [x] 3.3 删除tracked `web-dist`，加入精确ignore并更新Browser selector、ownership与静态布局检查

## 4. Candidate与npm发布物

- [x] 4.1 让Candidate builder生成一次完整artifact set，并把显式Web dist、Test Context与manifest identity交给Application Payload和npm staging
- [x] 4.2 更新Application Payload、release artifact、package inventory与fresh-install测试，证明无tracked生成物仍形成同一公开CLI/Web/Test Context发布表面
- [x] 4.3 验证相同source/lock/tool输入重复Candidate构建一致，且缺失、陈旧或未绑定本地输出不能被正式链路消费

## 5. 声明、知识与验证

- [x] 5.1 按Declaration Intake结论更新`verification.yml`的Web/build/generated source paths，保持两个现有Preparation recipe不变
- [x] 5.2 更新Service架构、验证框架、发布流程和Buildr/Buildr Web当前知识，并完成术语与knowledge impact收敛
- [x] 5.3 从无目标生成物的干净Git状态运行generator checks、后端/前端typecheck、contract、Browser、Application Payload与Candidate相关验证
