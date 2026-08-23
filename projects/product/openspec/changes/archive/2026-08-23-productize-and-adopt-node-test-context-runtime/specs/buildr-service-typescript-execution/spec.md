## ADDED Requirements

### Requirement: 独立公共ESM library必须与CLI Payload采用不同编译目标
Buildr Service MAY为规范明确声明的独立公共package subpath从TypeScript authority生成标准ESM JavaScript与`.d.ts`，但 MUST保持CLI Application Payload的单一CommonJS bundle与正式Host Node启动模型。公共library生成物 MUST不依赖CLI bundle、Buildr Workspace或TypeScript runtime，raw library `.ts` MUST不进入正式Candidate tarball。

#### Scenario: 构建Test Context公共library
- **WHEN** 维护者运行Test Context生成入口
- **THEN** 独立compiler config MUST从Runtime TypeScript authority生成ESM `.js`与matching `.d.ts`
- **AND** 根backend typecheck MUST继续以strict no-emit检查同一authority

#### Scenario: 构建CLI Application Payload
- **WHEN** release builder处理包含其他`.ts`生产切片的CLI模块图
- **THEN** CLI MUST继续生成单一`runtime/buildr.cjs`且不运行公共Test Context library作为CLI依赖
- **AND** 新library pipeline MUST不改变CLI、HTTP、JSON、SQLite或Launcher行为

#### Scenario: 检查正式tarball TypeScript内容
- **WHEN** Candidate inventory检查公共Test Context与CLI runtime
- **THEN** tarball MAY包含公共`.d.ts`但 MUST不包含Runtime authority `.ts`、TypeScript compiler或Node类型开发包
- **AND** JavaScript runtime MUST不引用`.ts`路径
