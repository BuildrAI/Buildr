## 1. 后端更新能力

- [x] 1.1 `programmatic-credentials.ts`：抽取与 `create` 共用的参数校验；新增 `update(id, revision, raw, registered)`，仅更新 metadata、换新修订，事务内复核撤销与修订，不触碰 digest 与令牌文件；`allowFullAccess` 省略保持当前值。
- [x] 1.2 `programmatic-http.ts`：新增 `POST /api/v1/app/programmatic-access/:id/update`，会话 `authorizeWrite`，输入键限定 `expectedRevision` 与四个参数键。

## 2. 前端编辑闭环

- [x] 2.1 `programmatic-access-api.ts`：新增 `update(credential, input)`。
- [x] 2.2 `ProgrammaticAccessCreateModal.tsx`：编辑模式（`editing` 预填、标题「编辑接入程序」、按钮「保存修改」），创建模式不变。
- [x] 2.3 `ProgrammaticCredentialCard.tsx`：有效凭据管理菜单增加「编辑参数」。
- [x] 2.4 `ProgrammaticAccessSettings.tsx`：编辑状态与保存流程，成功后替换列表对应凭据，失败沿用错误条与刷新。
- [x] 2.5 表单由 Modal 改为第二层抽屉 `ProgrammaticAccessFormDrawer`（复用 `DrawerShell`），与项目抽屉编辑约定一致；同步样式与浏览器旅程。

## 3. 测试

- [x] 3.1 `services/buildr/test/integration/programmatic-agent-http.test.ts`：update 成功（令牌与 ID 不变、程序端按新 scopes/workspaces 授权）、409 冲突与撤销、400 非法参数。
- [x] 3.2 `services/buildr-web/test/programmatic-access-api.test.mjs` 与浏览器旅程：编辑模式预填、保存调用与冲突提示（programmatic-credential-edit-journey）。

## 4. 当前知识

- [x] 4.1 assess：核对 `knowledge/code-map` 与 `docs/architecture/agent-integration.md`、glossary；现有成果未描述凭据管理生命周期，本次无改写影响（not-applicable）；实现后复核该结论（知识文件未改动，结论不变）。

## 5. 直接验证

- [x] 5.1 运行受影响服务的相关静态检查与单元测试（buildr、buildr-web），修复失败。
- [x] 5.2 开发预览实测：编辑入口预填、修改保存、列表与接入信息刷新、冲突提示（snapshot 隔离预览 + 无头浏览器全栈闭环，含创建与撤销临时凭据）。
