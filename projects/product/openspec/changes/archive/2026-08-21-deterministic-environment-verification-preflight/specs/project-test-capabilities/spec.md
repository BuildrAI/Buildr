## ADDED Requirements

### Requirement: Verification capability 必须显式声明准备依赖
Project Verification capability MAY在既有`environment`边界中引用同一Project `preparation.yml`的一个或多个Recipe。每个引用 MUST绑定Project、Project-wide或已登记Service scope与Recipe id，并进入capability declaration identity；Buildr MUST NOT从invocation、capability id、目录或技术栈推断准备Recipe。

#### Scenario: Browser capability引用辅助Service Recipe
- **WHEN** `product.browser-smoke`引用`service:product/buildr-web`的`buildr-web.npm-ci`
- **THEN** declaration parser MUST验证Project、Service与Recipe当前存在且scope匹配
- **AND** 该引用 MUST只表达执行准备，不得把`buildr-web`加入Task scope、Change scope或交付内容

#### Scenario: Capability没有准备引用
- **WHEN** 既有v2 capability未声明任何preparation reference
- **THEN** declaration MUST继续有效且该capability的准备集合为空
- **AND** Buildr MUST不扫描Project猜测隐含依赖

#### Scenario: 引用越界或缺失Recipe
- **WHEN** capability引用其他Project、未登记Service或当前声明不存在的Recipe
- **THEN** Doctor与Verification admission MUST在执行前返回精确invalid或preparation gap
- **AND** MUST不自动改写`verification.yml`、`preparation.yml`或Task scope

### Requirement: Capability准备引用不得形成测试DAG
Capability preparation references MUST只形成“该capability执行前所需Recipe current”的平面集合，MUST NOT表达capability间`dependsOn`、执行顺序、supersedes、scheduler或Candidate阶段。

#### Scenario: 多个capability引用同一Recipe
- **WHEN** 两个selected capabilities引用同一Project、scope与Recipe identity
- **THEN** admission MUST按identity去重为一个准备要求
- **AND** MUST不据此创建capability依赖边或改变两者的执行顺序
