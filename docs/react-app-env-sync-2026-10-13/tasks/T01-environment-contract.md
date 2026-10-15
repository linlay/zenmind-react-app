# T01 环境契约与版本制品

[返回总览](../README.md)

状态：**未开始**。前置：无。交付后进入 [T02](T02-brand-native-targets.md)。

## 目标与范围

把默认云端、Identity、Hub 和现有导出资源地址收口到同一环境契约，交付确定、可校验、可追溯的配置制品。扩展现有 producer/consumer，不建立新的配置产品。

主要仓库：react-app-env；同步修改 App 的消费校验和 example。本任务不装配原生工程、不发布 OTA、不修改用户凭据。

## 先读入口

- react-app-env：AGENTS.md、README.md、schema/react-app-env.schema.json、scripts/lib/config.mjs、scripts/materialize-environment.mjs、scripts/package.mjs、scripts/verify-consumer.mjs、现有 tests/。
- App：[app-env-config.js](../../../scripts/lib/app-env-config.js)、[appEnvironment.ts](../../../src/core/config/appEnvironment.ts)、[appEnvConfig.test.mts](../../../scripts/tests/appEnvConfig.test.mts)。
- 阅读路径是预期影响范围，不要求为了清单改每个文件。跨仓库执行先遵守目标仓库自己的 AGENTS.md。

## 必须完成

1. 将 producer、consumer、example 同步升级为 schema v3；沿用现有 brands、environmentId、defaultSource 结构。每个环境制品完整覆盖已声明品牌，App 构建时只选择目标品牌生成静态配置。
2. 在品牌环境配置中增加简单 services 对象：identityApiBaseUrl、tunnelHubApiBaseUrl、conversationExportAssetOrigin。Identity/Hub 显式必填，不从默认云端互相猜地址；导出资源地址仅在已有 HTML 导出能力使用，缺失保持现有不可用分支，不新增功能开关或资源服务。
3. 延续 defaultSource 的 id、displayName、API/WS、wsPath、authMode 和客户端 accessToken。显式 wsUrl 优先，缺失才由 API 与 wsPath 推导；同一逻辑来源迁移域名保留 sourceId，不同数据集使用不同 sourceId。
4. development、preview、production 使用统一命名。preview/production 要求 HTTPS/WSS 和公网地址；example 只使用无效 endpoint/占位 Token。没有真实配置的组合报告缺失，不创建假生产地址，不用 staging 做隐藏别名。
5. 修复 materialize-environment.mjs 写入字面量反斜杠 n 导致 JSON 无法解析的问题；在任务自有暂存目录物化配置，不覆盖用户真实 env 文件。全部输入验证通过再输出；失败/中断清理自有私有材料。
6. 沿用当前 JSON 制品＋manifest、VERSION、SHA-256 逻辑。制品确定可复现，不写当前时间；manifest 记录环境、schema、artifactVersion、源 commit 与摘要，不含 Token。
7. 校验实际 App 品牌声明集合与 producer 品牌集合；修复 verifier 用制品自身的品牌键充当 consumer 预期集合的自证问题。consumer 校验目标品牌/环境、版本与摘要，不在生成阶段从 process.env 补全业务地址。
8. 删除本次替代的 v2 分支、字段与失效测试预期；不保留双 schema 兼容。真实凭据不提交，除已有 defaultSource.accessToken 外不新增凭据字段。

## 防止过度设计

只增加确定的 services 字段和必要验证。不要引入配置继承树、任意字段透传、多格式支持、远端拉取、配置 registry、通用 secret 映射、制品数据库或第二套 manifest。App/env 各自保留边界校验，不借机建设跨仓库共享基础库。

## 验收

- 实际执行物化入口后 JSON 可解析，内容能通过 producer 与 consumer；不是只测试 JSON.stringify。
- 缺品牌、缺 Identity/Hub、环境混用、非法 URL、Token/authMode 冲突、摘要不符和实际 App 品牌不符均明确失败。
- 相同输入生成字节一致的制品；目标 Bundle 配置只包含选中品牌，其他品牌 Token 不进入目标静态配置。
- example 可完成契约验证，真实配置保持忽略，日志和 manifest 不包含客户端 Token。
- 按仓库已有 pnpm lint/validate/test/check 和 consumer verifier 执行有意义的检查；真实服务配置不足时记录缺口，不把 example 算作联调。

## 清理与记录

先记录两仓库 Git 状态、生成文件和 env/dist 原状，所有试验使用任务自有目录。结束核对差异、恢复临时覆盖、移除自有私有输出，保留预先存在的 env、dist 与用户改动。记录契约版本、输入版本/摘要、验证结果和删除的旧逻辑；将对应 curated 配置模块/任务更新为实际已落地行为，再运行 XGraph。
