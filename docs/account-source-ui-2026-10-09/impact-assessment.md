# 跨项目影响评估（2026-10-09）

评估时结论（历史）：当时补丁属于跨项目的账号接入与数据边界变更，影响等级为高，不能按“仅手机 UI 改造”或“关闭账号模式即完全兼容旧客户端”发布。本轮发现四项上线前应处理的问题；此前“除真实验收外没有待实现项”的结论需要修正。本轮只评估并更新文档，没有修改业务代码、部署配置或真实数据。

## 最新范围决定

用户后续要求“云端的保持现状，先不改”。T03 暂缓，云端 Platform、WebClient、管理接口、Token/Cookie 及 Agent 能力沿用现有部署。下文描述的是此前已应用补丁的影响，保留为历史证据，不作为本阶段继续改造云端的依据。

按修订计划执行后，Platform 的 T03 差异已逐项撤除，工作区干净；App 恢复现有云端 authMode/accessToken。下方三项云端 P1 描述已撤除补丁的历史行为，不再是当前代码行为；Desktop 退出问题已由 T02 修复并通过本地回归，真实验收待用户执行。

## 评估依据与边界

核对本地 Platform、Identity、Hub、Desktop 的 diff，以及 WebClient、隧道测试工具、Kanban、App Server、Container Hub 的相关源码调用方。没有访问生产服务、实际环境文件或凭据，因此下面的历史结论描述评估时补丁的代码行为，不表示线上已发生故障。Identity 的现有工作区还包含本轮以前的账号设备代码和数据库变更，不能把整个 Git diff 都归因于此次 Desktop 路由补丁。

Platform 当时补丁包含 57 个文件：47 个实现文件、5 个测试文件、5 个文档或配置示例。没有新增数据库 schema、依赖、租户表或第二套 Repository；复用了 Principal、聊天 source 和既有执行链路。这降低了结构改造成本，但不意味着兼容性和权限边界已经全部验证。

## 按运行模式判断影响

| 运行条件                                   | 确定行为                                                                  | 影响                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Platform 配置 `auth.identity-api-base-url` | 仅接受符合要求的账号手机 JWT；普通旧 JWT 被拒绝；账号接口按名单开放       | 连接同一云端实例的任何客户端均受影响，不区分 React App、WebClient 或脚本                  |
| 未配置上述地址，JWT 不含 `account_id`      | 列表和统计仍走原全局语义，云端推送归属过滤不安装                          | 大多数 Desktop/local 功能保留，但续聊和上传增加了主体归属检查，派生聊天也改变 source 处理 |
| 未配置上述地址，JWT 含 `account_id`        | 仍要求 mobile/app claims，并调用账号设备校验；未配置 authority 时验证失败 | 配置关闭不是完全隔离条件，第三方或旧客户端可能受影响                                      |
| Desktop 本地 `/ws`                         | 原有本地凭证入口保留                                                      | 本地 Desktop/WebClient 链路预期影响较低，仍需回归                                         |
| Desktop 经 Hub 的远程 WS                   | 强制使用账号路由凭证，不再接受原本地凭证                                  | 旧 App、远程 tester 和自建客户端会失去原远程连接能力；此变化不等待 Hub 新配置启用         |

## 项目与功能范围

| 项目/使用方                              | 直接变更或依赖                                                              | 等级与具体影响                                                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| zenmind-react-app                        | 登录、来源、缓存、连接、资源与 UI                                           | 高；新账号流程替换旧配对流程，旧本地聊天缓存可清空，旧凭证不再回退                                                                                            |
| agent-platform 云端                      | JWT、SQL、HTTP/WS、资源、归档、SSE、工具权限                                | 高；所有调用方共享新的服务端边界；管理控制面、历史可见性和部分 Agent 能力改变                                                                                 |
| agent-platform 本地实例                  | 同一个程序与共享实现                                                        | 中；非账号 query/上传也增加归属校验，派生 query source 保留；WS 每次写出增加锁读取，但不执行账号回调/归属查询                                                 |
| agent-webclient                          | 本轮未改其源码；直接依赖 Platform HTTP/WS，并具有管理、Memory、连接器等功能 | 云端高、本地低至中；云端管理接口被拒绝；独立浏览器模式仅读取已有 Token，没有本次 App 的 Identity 自动刷新链路；Desktop 内嵌 Frame Port 和本地代理仍用本地凭证 |
| zenmind-desktop                          | 注册 UUID、路由授权、刷新、退出、隧道和目录目标                             | 高；远程认证契约改变；注册与退出新增 Identity/Hub 依赖，本地 Platform 主体没有被手机账号替换                                                                  |
| tunnel-hub-server                        | presence、路由接口、Identity 代理和主体解析                                 | 中至高；启用 Identity 后返回 canonical UUID，新 UUID 可能对应新的公网 host；旧 ID/收藏地址/登记记录不自动迁移；存在 `account_id` 时通用 JWT 主体也改用它      |
| identity-center                          | 本次新增 Desktop 登记、路由签发和验证接口                                   | 中；复用 OAuth/账号设备表/签名 key，没有在本次补丁重写其他登录流程；必须先部署新接口才能让新 Hub/Desktop 使用                                                 |
| tunnel-hub-tester 与旧远程客户端         | 本轮未改源码，当前 tester 使用手填 Desktop Token                            | 高；原本地 Token 不能再通过新 Desktop 的远程入口；重连需要新 JTI，刷新需要新路由凭证；tester 没有自动获取该凭证的代码                                         |
| zenmind-kanban-server                    | 未找到服务端直接调用 Platform 的业务链路；Desktop 的看板运行经 Desktop 接口 | 直接影响低；通过 Desktop 的运行与远程操作间接受鉴权/退出影响，需验收该链路                                                                                    |
| zenmind-app-server                       | 相关源码未发现 Platform 业务调用，服务自身鉴权未修改                        | 直接影响低；若真实部署还有源码之外的代理或集成，仍需部署清单确认                                                                                              |
| agent-container-hub                      | sandbox 协议未修改，Platform 账号 Bash 要求既有隔离环境                     | 协议影响低；云端 Agent 若没有可用 sandbox，原 Host Bash 能力会被拒绝                                                                                          |
| desktop-webapp、builtins、分发与环境项目 | 本次没有修改其执行实现/制品生成契约                                         | 直接源码影响低；通过 Desktop 的远程访问和更新后 Platform 的运行权限，可能间接受影响；同版本分发应包含互相兼容的组件                                           |

## 此前补丁发现的问题（云端三项随 T03 暂缓）

### P1：云端模式覆盖现有管理控制面

[JWTVerifier.Verify](../../../agent-platform/internal/server/security.go) 在云端模式拒绝不含 `account_id` 的旧凭证；历史 `accountRouteAllowed`（`internal/server/account_access.go` 已撤除） 又拒绝账号访问 `/api/admin/*`、Memory 等接口，没有管理员例外。

本地模拟服务实际复现 `/api/admin/registries`、`/api/admin/connectors/auth`、`/api/memory/records`：原管理员 JWT 返回 401，账号 JWT 返回 403。若单个云端实例仍由现有 WebClient 管理，该管理链路不可用。应在同一实例内明确并保留已有管理凭证/管理入口的职责，不能让手机账号规则覆盖整个控制面，也不能简单放开普通账号管理权限。

### P1：未启用云端模式也有凭证和续聊行为变化

[security.go](../../../agent-platform/internal/server/security.go) 按 claim 存在性进入账号逻辑。探测确认：关闭云端模式时，原来可验证的 JWT 增加 `account_id` 后被拒绝；即使具备完整手机 claims，也因缺少 Identity authority 失败。

[query admission](../../../agent-platform/internal/runtime/query/admission.go) 的新增检查也对旧主体生效。本地探测确认非账号 `legacy-b` 续聊 `query:legacy-a` 返回 403。[upload](../../../agent-platform/internal/server/handler_resource.go) 的后置检查与[derive](../../../agent-platform/internal/chat/derive.go) 的 source 保留同样是共享变化。前者可能是合理的权限收紧，但不能当成“本地行为完全不变”。应明确账号模式的适用边界，并验证本地主体稳定性和已有历史归属，而非新增兼容认领或自动迁移。

### P1：Agent 置顶工具能修改其他账号聊天

[platform_control.chat.set_pinned](../../../agent-platform/internal/platformcontrol/chat_pinned.go) 只验证普通主 Agent 调用资格，没有检查目标 chatId 的账号归属；[conversation.SetChatPinned](../../../agent-platform/internal/conversation/pinned.go) 也没有账号上下文。

使用真实临时 FileStore，分别创建 `query:account-a` 和 `query:account-b` 的聊天，并让 account-a 的已挂载普通 Agent 调用该工具指定 account-b 的 chatId，成功写入 account-b 的置顶状态。条件是 Platform Control 启用、Agent 挂载该工具且调用者提供另一聊天 ID。本次证明了跨账号修改，未据此声称可以读取对方聊天正文。应在既有工具/会话服务边界补归属检查，不能仅依赖 HTTP/WS 门禁；这也使此前“完整账号隔离已完成”的结论失效。

### P1：远端撤销失败会中断 Desktop 本地退出

[sso.logout](../../../zenmind-desktop/src/main/modules/identity/ipc.ts) 在本地退出和停止隧道之前直接 await 远端撤销；[revokeTunnelAccountDevice](../../../zenmind-desktop/src/main/modules/tunnel/registration.ts) 对超时、网络异常和非成功响应抛错。当时该调用没有兜底，Promise 拒绝会直接跳过后续退出与 Cookie 清理；现已增加失败收口。

此项当时由静态控制流确认；现已修复，并以远端撤销抛错的退出 handler 回归确认本地 SSO、tunnel、cookies 和提示均收口。尚未通过真实离线 Desktop 验收。触发条件是已有账号登记与注册凭证，并且 Hub/Identity 不可用或撤销被拒绝。应保证本地退出/停止访问可以收口，单独报告远端撤销结果，不能让新增服务依赖阻止用户退出。

## 数据、能力与性能影响

- 云端旧无归属/旧用户名 source 历史没有删除，但新账号查询不可见；不能把“数据仍在”当成“升级后历史体验不变”。本轮不自动认领或迁移。
- Agent/Team/Skill/Connector 定义仍是管理员发布的公共目录。账号会话不能使用全局 Memory、写公共 Workspace 或使用未隔离 Host Bash；依赖这些能力的现有 Agent/CODER/KBASE 编辑或 CLI 流程应逐项核对，不应承诺所有已发布 Agent 在云端仍完整可运行。
- 连接器调用仍沿用部署级凭据，公共 Agent 若挂载个人连接器或私有资料，会有共享能力风险；本轮没有实现每账号连接器凭据，也不应顺手扩展该系统。
- 本地非账号推送未增加聊天归属 SQL，未读统计保持全局语义；通用 WS 写出增加一次锁读取，SSE 增加观察 context，这些开销没有独立量化。
- 云端验证采用 10 秒成功缓存、1 秒失败缓存、1024 项上限和同 Token 单飞；缓存失效时 WS/SSE 写出路径可能同步等待 Identity，最长 8 秒。撤销并非毫秒级即时生效，Identity 故障会关闭观察连接或拒绝请求，任务继续执行。
- 当前 Chat/Archive schema 没有 `SOURCE_` 索引。新增 SQL 条件先于分页/计数避免跨账号结果截断，但大规模共享库仍可能扫描大量行。没有生产负载或 p95/p99 基准，不能凭本地功能测试宣称已满足高性能。应先用代表性数据核对查询计划和延迟，再决定是否需要最小索引，不新增缓存框架。
- 事件增加 `source/chatId` 是附加字段；严格逐字段比较的外部消费方需要核对。Go 内部 Store 方法增加可选 source 参数，调用保持默认路径，但自定义 interface 实现的方法签名仍需适配；仓库外不能直接导入 Go `internal` 包。

## 验证证据与建议顺序

本轮创建临时 Go overlay，没有往 Platform 仓库写入测试文件。四个诊断探测均成功复现当前行为：关闭模式的 account claim 校验、云端管理接口拒绝、旧主体续聊归属限制、Agent 跨账号置顶。命令：

```text
GOTOOLCHAIN=local GOPROXY=off GOCACHE=<本轮临时缓存> go test -mod=readonly -p 2 -overlay=<本轮 overlay> -run '^TestImpactProbe' -v ./internal/server ./internal/platformcontrol
```

server/platformcontrol 探测通过表示问题复现成功，不是兼容性验收通过。使用获准的 loopback 本地模拟服务完成四项探测。上述探测不能替代 Desktop 离线退出、真实 WebClient 管理、生产数据规模或其他客户端联调。

当前按新范围收敛完毕：云端任务改动已剥离、App 沿用既有云端契约、Desktop 本地退出已修复；后续由用户验证设备/电脑授权、旧远程客户端升级边界、Hub canonical UUID 公网地址及手机来源/缓存。云端只回归原有凭证、接口和能力兼容性；不继续三项云端 P1 的功能改造，也不新增双账号隔离/生产规模性能验收。设备链路按 Identity → Hub → Desktop/App 的依赖准备，云端部署保持现状。

评估时临时测试、overlay 和 Go 缓存已清除；以开始评估时十个仓库的文件 hash、HEAD、分支、暂存区与本地 Git 配置摘要完成清理审计。本轮允许保留的变更只有本报告、计划状态、任务上下文及必要 XGraph 派生索引。实际审计结果见执行状态记录。
