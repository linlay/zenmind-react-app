# React App 品牌与环境配置同步改造执行大纲

建档日期：2026-10-13。状态：**未开始**。本目录记录已确认方案，代码、构建与真实验收尚未实施。

目标：同一份 App 源码，按 `brand × environment` 构建独立应用；配置通过固定版本的 react-app-env 制品进入开发、构建和 OTA 链路。**变更直接了当，架构优雅，无冗余代码逻辑，绝对不允许过度设计。**

这里的“同步”是构建期配置装配，不是在线配置推送，也不是聊天数据同步。与旧多品牌卡片中的共享应用身份、共享 OTA、全品牌运行时选择约束冲突时，本计划是后续改造的目标依据；旧卡片仍描述当前实现，随对应任务落地更新，不把计划写成已完成事实。

## 已确认决策

| 项目         | 最终口径                                                                      |
| ------------ | ----------------------------------------------------------------------------- |
| 品牌         | ZenMind、CuteJ；共用源码，各自独立 App，安装后固定品牌，无运行时切换          |
| 服务环境     | development、preview、production；与品牌独立组合，缺配置直接失败              |
| 安装身份     | 每个品牌、环境组合具有独立 Android applicationId 和 iOS bundle id，可并排安装 |
| EAS          | 共用现有一个 EAS 项目、projectId、项目 slug 与 updates URL                    |
| OTA          | 按品牌、环境分 channel；每个 Bundle 只注入目标品牌、环境配置                  |
| 应用版本     | 共用 package.json 应用版本号，各自维护构建号和发布节奏                        |
| env 版本     | 独立版本；发布固定 App commit、env commit、配置制品与摘要                     |
| 默认开发     | App 目录 pnpm start 默认 ZenMind＋development；缺真实开发配置报错             |
| 配置来源     | 正式服务地址只来自环境制品；取消旧 MMKV 地址覆盖，开发覆盖仅本次进程有效      |
| 客户端 Token | 保留现有可分发客户端 Token；用户登录凭据和签名材料不进入环境制品              |
| 账号恢复     | Identity／Hub 配置变化时本地失效并重新登录，不向新服务发送旧凭据              |
| 云端缓存     | 沿用手动 Token 优先、业务验证、凭据 scope 隔离；不跨 scope 重放 outbox        |
| 发布入口     | App 提供统一装配入口；本地与手动触发 CI 复用，不自动生产发布                  |
| 兼容性       | App 未正式发布，不实现旧共享身份、旧 channel、旧凭据格式的迁移兼容            |

## 项目分工

| 内容                                                 | 权威来源                                               |
| ---------------------------------------------------- | ------------------------------------------------------ |
| 名称、图标、启动图、通知色、本地化、品牌基础安装标识 | App 的 brands/<brand>/                                 |
| 共用 EAS 项目、应用版本、变体派生和构建规则          | App 的 brands/shared.json、package.json、构建入口      |
| 默认云端、Identity、Hub、已有导出资源服务配置        | react-app-env 的 env.<environment>/brands/<brand>.json |
| 配置 schema、环境校验、制品、manifest                | react-app-env；App 校验消费契约                        |
| 账号与手动 Token、电脑选择、聊天缓存、偏好           | App 现有运行态服务                                     |

借鉴 zenmind-env 的配置所有权、环境制品和显式输入方式；不搬入 Desktop 的服务部署、Agent／Skill／Team 资源安装、运行目录导入和升级事务。

## 最小架构

```text
App 品牌源 + 共用构建规则 + 指定环境制品/manifest
  -> 校验目标与制品
  -> 生成单品牌、单环境静态配置与现有品牌资源
  -> Expo 配置、Android/iOS 原生配置、JS 消费同一目标
  -> 开发 / 导出 / EAS Build / OTA
```

1. 扩展现有 brand-config、app-env-config、prepare:runtime、prepare:bundle 和认证入口。只增加完成当前链路必需的小函数或轻量命令入口，不另建配置框架。
2. 目标只表达 brand、environment、platform 和选定制品；channel、runtimeVersion、安装标识由固定规则派生，不新增可任意覆盖的策略层。
3. 生产 Bundle 不保留全品牌 registry 和动态品牌选择。原生壳与生成配置的身份不一致时明确失败，不静默回落 ZenMind；Web 直接使用构建目标。
4. 替换后删除被替代的旧调用、fallback、重复状态及无引用入口。不得长期保留 schema v2/v3、共享/独立身份、两种配置来源并行可达的路径。
5. 保留已有图标缓存、Worklets 和 Markdown 预生成链路；一次命令只准备一次，不顺手重构无关脚本。
6. 页面不读配置文件、不操作 SQLite/MMKV/WebSocket。聊天写入继续通过 chatSyncService/chatRepository，不新增同步服务、Provider、连接池或缓存迁移机制。
7. 新增抽象必须指出当前实际复用点和删掉的重复代码；仅为了“以后扩展”不得新增。默认不新增依赖。
8. 遵守各仓库依赖规则：AI 不安装依赖、不改 lock；若确需依赖，只调整允许修改的 package.json，由用户处理安装与 lock。

## 安装与更新规则

各品牌在 App manifest 声明 Android、iOS 基础标识；development 派生 `.dev`，preview 派生 `.preview`，production 使用基础标识。开发/预览名称显示环境。实际基础标识及平台注册情况在 T02 核对，不把示例 ID 当成已注册身份。

| 品牌    | development channel | preview channel | production channel |
| ------- | ------------------- | --------------- | ------------------ |
| ZenMind | zenmind-development | zenmind-preview | zenmind-production |
| CuteJ   | cutej-development   | cutej-preview   | cutej-production   |

runtimeVersion 使用 `<brand>-<environment>-<appVersion>`，如 `cutej-production-1.0.0`。不包含 env 制品版本或构建号，使同一原生运行时可以接收配置更新；改变原生能力必须提升共用应用版本并重新构建。channel 与同名 EAS branch 一一对应，不跨目标重绑。构建号按应用标识、平台维护和核对。

共用 EAS 项目不等于共用商店应用。两个正式品牌分别配置商店应用记录和签名；提交使用明确 build ID 或 IPA，不以同项目最新构建猜品牌。

## 任务与依赖

| ID  | 子任务                                                        | 前置     | 状态   |
| --- | ------------------------------------------------------------- | -------- | ------ |
| T01 | [环境契约与版本制品](tasks/T01-environment-contract.md)       | 无       | 未开始 |
| T02 | [独立品牌变体与原生配置](tasks/T02-brand-native-targets.md)   | T01 契约 | 未开始 |
| T03 | [统一执行入口与会话绑定](tasks/T03-entry-session-binding.md)  | T01、T02 | 未开始 |
| T04 | [手动 CI、集成验收与清理](tasks/T04-ci-validation-cleanup.md) | T01–T03  | 未开始 |

按顺序执行，每项先核实当前代码；已有能力直接验收复用，不为了任务清单重复实现。T01 负责制品，T02 负责目标，T03 负责接线和运行态消费，T04 只复用前三项做发布与验收，不重建实现。

## 验收与执行纪律

- 六个目标在 Android/iOS 的安装身份唯一，名称、服务配置、channel、runtimeVersion 与 Bundle 目标一致。
- 两品牌及同品牌不同环境可并排安装；对一个目标发布 OTA，不改变其他目标的配置与表现。
- 本地开发、Web 预览/导出、原生调试、正式构建、OTA 复用同一装配规则；测试使用独立 example，不把 example 打成正式包。
- 配置与 manifest 错误、环境/品牌缺失、壳/Bundle 不一致在使用或发布前失败；不泄漏 Token。
- 账号地址变化不带旧凭据到新服务；云端换凭据验证成功才切 scope，旧缓存和 outbox 不被误删或重放。
- 每项记录实际改动、删除的旧逻辑、验证结果和清理证据。静态配置检查、mock、Expo export 均不代表真机或真实服务验收通过。
- 每次执行前记录 Git 状态及临时配置/生成物原状；成功、失败和中断都恢复临时状态。只删除本任务创建且归属明确的临时文件，保留用户既有改动。
- 子任务与总表同步使用“未开始 / 进行中 / 已完成 / 阻塞 / 暂缓”。真实验收或清理未完成，不标整体完成。

## 不做项

不新增在线配置中心、配置订阅/轮询、动态品牌/环境切换、功能开关平台、通用 overlay/策略引擎、插件注册表、产物管理服务、凭据框架或迁移框架。不改业务 UI、聊天协议、服务端认证和部署；不自动创建新 EAS 项目，不兼容未发布的旧构建。现有一个配置文件、manifest、校验与静态生成流程能完成的事情，不再叠加第二套机制。

## 建档记录

2026-10-13：根据讨论后的最终决策创建总览、T01–T04 和 XGraph 任务入口。仅文档建档，未修改业务实现、环境配置、依赖或发布资源。
