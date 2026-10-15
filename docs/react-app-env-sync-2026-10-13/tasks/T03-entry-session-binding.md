# T03 统一执行入口与会话绑定

[返回总览](../README.md)

状态：**未开始**。前置：[T01](T01-environment-contract.md)、[T02](T02-brand-native-targets.md)。交付后进入 [T04](T04-ci-validation-cleanup.md)。

## 目标与范围

让现有启动、调试、导出、构建和更新入口使用同一配置装配结果；运行态只读生成配置，账号与云端继续复用既有生命周期。本任务接线，不重写认证、同步和缓存系统。

## 先读入口

- [package.json](../../../package.json)、[prepare 同步](../../../scripts/sync-brand.js)、[环境消费](../../../scripts/lib/app-env-config.js)、[runtime 配置](../../../src/core/config/appEnvironment.ts)。
- [账号地址配置](../../../src/core/auth/authConfig.ts)、[账号恢复](../../../src/core/auth/accountAuth.ts)、[云端凭据](../../../src/core/auth/cloudAuth.ts)、[云端验证](../../../src/features/chatPersistence/cloudAccess.ts)。
- [来源协调](../../../src/features/chatPersistence/accountDesktopSource.ts)、[当前 transport](../../../src/core/api/activeWsTransport.ts)、[导出服务](../../../src/core/api/services/chatExport.ts)。
- react-app-env 的 examples/build-react-app.sh；仅复用已验证部分，正式 App 入口负责装配，不让 env 反向承担 App 发布。
- [现有账号云端计划](../../mobile-auth-source-2026-10-12/README.md) 与 core-auth-session、core-runtime-config、core-api-client、app-startup 卡片。

## 必须完成

1. 提供一个轻量装配入口供现有 pnpm scripts 调用，统一解析 brand、environment、platform 和 artifact/manifest。CLI 参数与进程变量冲突直接报错；品牌/环境未知、输入不完整直接失败，不使用持久化的“上次目标”。
2. 本地无参 start 使用 zenmind/development，从显式配置路径或约定的 sibling react-app-env 开发目录取得真实配置；缺配置报错。其他本地调试默认同一目标；切品牌/环境重启 Metro，装配输入覆盖命令整个生命周期。
3. 正式原生构建、正式导出与 OTA 显式指定目标和固定版本制品；不自动改用 development/example/latest。环境制品先校验再复制进临时 App 构建上下文，远端 EAS 只依赖上传上下文内的路径。
4. 统一接入 start、android、android:device、ios、web、export、EAS Build/OTA 与 post-install；保留 prepare:runtime/prepare:bundle 的现有分工和 Worklets/Markdown 准备，不在父子入口重复生成。
5. 类型检查与契约测试使用显式 example 路径，包含生产构建错误门控测试；诊断覆盖仅作用于 **DEV** 和当前进程，不作为正式地址第二来源，不持久化真实配置。
6. 默认云端、Identity/Hub 和 HTML 导出资源地址从生成配置读取。取消 authConfig 的旧 MMKV 地址优先、相关保存入口及服务地址的 EXPO_PUBLIC fallback；不再通过默认云端猜账号服务。仍被使用且无关的开发调试 env 读取保留。
7. 持久化账号凭据记录当前账号服务 binding（brand/environment/规范化 Identity/Hub），恢复与凭据使用前核对。配置不一致时复用最小本地清理：generation 失效、清旧凭据与 pending、发布未登录状态；不调用会向新 Identity 发旧 Token 的远端 logout。
8. 仅制品版本、资源地址或默认云端配置变化时保留账号登录；Identity/Hub 变化重新登录。独立安装目标天然隔离品牌/环境，不实现跨 App 会话迁移、环境切换或旧格式升级。
9. 沿用 cloudAuth/cloudAccess：同来源手动 Token 优先，内置 Token 轮换仅替换自动凭据；endpoint/source/authMode 变化不带旧凭据。业务验证成功才切 scope，保留旧缓存/outbox，不跨 scope 重放；同 binding 的主动退出不被配置 Token 更新复活。
10. 清理被替代的 env wrapper、重复命令与旧读取链路，检查调用方和失效报错文案。保留 API/service、sharedWsTransport、chatSyncService/chatRepository、SQLite 和 MMKV 目录快照边界。

## 防止过度设计

不要引入通用命令编排框架、任务 DAG、配置 Provider、认证适配器、第二套 store、同步引擎或迁移库。不增加静态配置的运行中监听；配置随安装包/OTA 重载生效。现有小函数和已有 auth generation 能解决的事情，不另建事件总线或状态机。

## 验收

- 各入口解析到同一目标；默认开发可用，缺真实配置/目标冲突/正式误用 example 在启动或发布前失败。
- EAS 构建上下文中存在已校验的制品/manifest，不依赖本机 sibling；生产 JS 没有残留地址 fallback 或其他品牌配置。
- 账号恢复、刷新、Token 转发、注销在配置变化时不会将旧凭据发往新服务；迟到结果不能恢复已失效会话。
- 同 binding 的账号正常恢复；内置 Token 更新、手动 Token、主动退出和失败验证仍保持原有行为。
- 新云端 scope 不使用旧 outbox；账号退出不影响独立云端，云端退出不影响电脑账号；来源切换仍刷新对应 MMKV 目录快照。
- 优先扩展现有 accountAuthSession、appEnvConfig、mobileAuthSource/cloudApiCredential 行为测试；已有行为通过即可，不复制整套测试框架。

## 清理与记录

先记录生成文件、Expo 状态、env 与原生工程原状；finally/退出处理覆盖成功、失败和可捕获中断，仅清理本次所有权明确的临时内容。不得删除用户凭据文件、旧聊天数据库或预先存在的产物作为构建清理。文档记录实际入口/参数、删除的旧读取、测试与未完成真实检查，更新对应 curated module/flow/task。
