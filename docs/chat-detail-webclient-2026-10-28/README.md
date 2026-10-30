# 2026-10-28 对话详情增量同步执行证据

执行计划与状态唯一入口：[计划总览](../../../plan/2026-10-28-react-app-chat-detail-webclient-sync/README.md)。旧 2026-10-08 记录仅供历史参考。

2026-10-28 开始执行 T00。用户随后明确“这步暂时跳过”，对应云端环境与超长 step 样本验证；这些门禁保留未验证，允许继续独立的 B1 本地实现。该指令不等于 M1 真实部署/设备验收已通过。

## T00 基线与来源

| 对象 | 执行时版本与原有状态 |
| --- | --- |
| RN | `38fb77cdc562b879a5f9e43e91eed905ebd428a7`；`main`；工作区、暂存区干净 |
| WebClient | HEAD / 本地 origin/main 均为 `404ae3cb99d31a06697f2ee1192b4b025abda57a`，v0.5.26；工作区干净 |
| Platform 参考 | `d6aac5f84a399c5a251a70b7bd6b41cb248f71d3`，v0.5.26；工作区干净 |
| 运行 Platform | PID 38393，`/Users/ther/Library/Application Support/CuteJ/services/agent-platform/v0.5.25/backend/agent-platform`；Go build info 确认 `353012f8fd6e5e93bab1ebf20462af594f0d7845`，vcs.modified=false |
| 运行 Desktop | PID 35933，`/Users/ther/project/zenmind-workspace/zenmind-desktop/build/brands/cutej/dev/CuteJ.app/Contents/MacOS/CuteJ`；bundle version/build 均为 0.5.25；开发实例 |
| Desktop 源码 | `6cc57ff02658da19a06ec89a3717f72bcc125226`；116 个原有变更路径；仅只读核对，未切换分支或修改 |

Platform 配置目录为 `/Users/ther/.cutej/.desktop/config/services/agent-platform`；Desktop Chromium 数据为 `/Users/ther/.cutej/.desktop/state/chromium`。已有监听：Platform 17078；Desktop 11788、11789、17080、54503、54504、54512；Vite PID 35858 / 5173；Identity PID 38250 / 17076。没有启动、重启、终止或选择任何应用。

本轮没有 fetch。上述参考版本是已存在的本地 Git 对象，不宣称互联网最新版本。计划列出的三个 WebClient 文件和五个 Platform 文件从原快照到本轮参考对象没有差异。

| M1 来源 | query / chat / attach | VIEW / Form | 只读 VIEW 查询 | 鉴权与结论 |
| --- | --- | --- | --- | --- |
| 云端 | 参考源码具备；真实环境未验证 | 同左 | 同左 | `brands/react-app-env.json` 为 example.invalid 示例；用户指定暂跳环境验证；未纳入“已验证来源” |
| Desktop | 运行二进制版本已确认；手机路径未验证 | 本地 HTTP builtin GET 返回 401 | 参考源码有 `/api/view/query`；未执行实际查询 | `/healthz` 200；无凭据及运行实例现有凭据均 401；不能据此声称模板、配对认证或 WS 成功 |

E1 独立：参考源码 HTTP POST `/api/chat/sources/read` 与 `/api/chat/sources/file` 需要 Principal 和 Chat 授权；本机无凭据请求 401。两类来源都没有原文 HTTP 成功证据；不猜 Workspace URL、WS 或 action.call，不作为 B1–B5 的前置。

## 契约与样本

固定资产位于 [scripts/fixtures/chat-detail-webclient-2026-10-28](../../scripts/fixtures/chat-detail-webclient-2026-10-28/)。`provenance.json` 记录 Git 对象、原路径、SHA-256 与字节数。24 个 Markdown golden 与本轮 WebClient/Platform 对象逐字节相同。

- `wire-cases.json`：param/params 互斥、Form approve/reject/dismiss、Planning 不带 data、合法/非法 source/hash、普通业务 chatId/agentKey、三档 display、SEQ_EXPIRED 和重复 awaiting Push。是公开契约整理样本，不是实际部署响应。
- `ask_user_form.html`：真实 builtin 源码，9,883 bytes；含待平台注入的 policy 标记，不能冒充已展开的 HTTP 文档。
- `task-control-view.json` / `automations.html`：真实 `builtin.task-control/automations` 的声明与 8,095-byte 模板；查询名 list、operation automation.list、limit 1–100。不是从用户 Chat 捕获的冻结快照；不得编造 hash 或据此证明查询授权。
- `v9-form-snapshot.json`：当前 RN 原始 serializer 从非私密构造事件产生，包含已回答历史和 pending interactive。只为解码迁移验证，不证明任何旧模板仍受支持。
- 没有真实旧模板证据，因此不为未来兼容保留旧执行分支；旧 v9 可读事实保留，可操作旧结构需清除并等待权威详情校准。

预算：保留源码 256 KiB、bridge params 64 KiB；只读 query params/result 各沿用 64 KiB 上限，超限明确失败，不扩大 shared 全局预算。实际模板响应、最大查询结果的运行环境验证依用户指令暂跳；样本尺寸在 provenance 中，不宣称覆盖最坏业务结果。

恢复自动次数/时长**未冻结**：无真实超长 step 样本，用户指定暂跳。T06 不得把现有三次或经验五次包装成新预算。已冻结 wire 错误为 WS `code=seq_expired/status=409/message=SEQ_EXPIRED`，其 data 含 runId/chatId/oldestSeq/latestSeq/lastSeq；HTTP envelope 为 `code=409/msg=SEQ_EXPIRED`。Push 稳定身份采用 source/cacheScope、根 owner、Chat、Run、awaitingId；createdAt 校验 epoch ms，不当作每次不同的去重 nonce。预算耗尽后的新有效 awaiting Push 仍应一次去重校准。

## 验证与清理

实施前基线：严格 TypeScript、lint 通过；直接 node:test 全量 **787/787** 通过。没有运行含 prepare 的测试、构建或安装命令；没有修改依赖、lock、配置、分支或运行实例。

T00 fixture 验证 3/3 通过；B1 最终自动回归与清理证据见下文。所有真实部署/设备缺口仍保留；T00 状态与后续 B1 状态以外部计划为准。


## B1（T01–T03）本地实现与验证

本批已实现并一起编译，状态仍为进行中：真实来源成功认证与 Android/iOS 真机交互验收尚未完成，不能把静态导出当成 B1 已交付。T04 的前置是 B1 整体通过，本轮不越过该门禁启动 schema 改造。

| 子任务 | 实际实现和复用 |
| --- | --- |
| T01 | builtin/connector 引用、冻结 hash、互斥 param/params；service 验证来源、返回引用及当前 owner/awaiting 生命周期；namespace 仅处理已知外壳，保留 VIEW/Form/tool 业务 JSON。沿用 requestChatApi/requestChatTransport 和共享连接。 |
| T02 | 在线 Form 改为单 form:{title?,data}，Planning 归为内部 plan；Native 与默认 Web 有实际专用隔离宿主，显式 collect、帧身份校验、5 秒收集超时换帧、取消清 timer、拒绝不携带 data；Frontend Tool 继续原 params 和同一 ToolNode。 |
| T03 | 单一 append-only scanner 增加 openingLine/index，严格头规则归 feature；绑定写入内容节点 viewBindings，乱序、delta/end、消息缓冲、快照与序列化保持；缓存升级为 view/html/cachedAt 同一记录；viewHost.onData/resize 与 view_update 保持同一 iframe。 |

旧 v9 Form 在现有解码入口清除可操作旧 interactive，保留 prompt/payloadText/answer/answerSummary，不改数据库版本、不删除聊天。无真实旧模板证据，不保留旧模板执行适配。

删除：`getChatViewportApi`、`ChatViewportResponse`、旧 `/api/viewport` 请求、viewport fence/旧 VIEW JSON 信封执行、多 Form 数组/聚合/分页 helper、旧模板 params[] 解码、默认 Web 不可用占位。`conversationViewport` 目录名称保留，避免不必要的路径迁移；内部文档 key 的局部变量名不表示旧 wire 被保留。

新增 helper 均有当前消费者：timelineView 只读归一 binding，供 reducer/service 使用；awaitingFormFrame 与 useAwaitingFormFrame 为两个现有平台宿主共享专用 Form 文档隔离和收集校验，不承接 display 查询或业务提交。没有新增 Socket、持久化表、依赖、注册器、全局 store 或备用协议。

B1 仅支持静态 VIEW；未对模板导出空 query/invoke 方法，也未声称有查询的模板已经可用。T05 同批接通查询声明和往返；当前公开 automations 模板只用于契约依据。

最终验证：

- `node --no-warnings --experimental-transform-types --test scripts/tests/*.test.mts`：**800/800** 通过。
- `pnpm exec tsc --noEmit --noUnusedLocals --noUnusedParameters`：通过。
- `pnpm lint`：通过，无新增 warning。
- 本轮 Web、Android、iOS 生产静态导出通过；最终同一代码再次执行 `CI=1 TMPDIR=<本轮临时缓存> pnpm exec expo export --platform all --output-dir <本轮临时目录>`，**通过**，三平台产物均完成。
- 新测试覆盖 24 个 golden、逐字符追加/重写、业务字段保真、param/params 互斥、binding 先于内容/缓冲、快照替换/序列化、v9 只读恢复、Form init/update/collect/超时/取消/迟到、专用 Native/Web wrapper 与 VIEW 不重挂；已有目录/引用/Markdown/资源/提交保护回归继续通过。

本轮进程重查观察到外部将 Desktop/Platform 更新至 v0.5.26：Desktop PID 92269（同一开发 bundle 路径）、Platform PID 94785（`.../services/agent-platform/v0.5.26/backend/agent-platform`），Go build info 确认为 `d6aac5f84a399c5a251a70b7bd6b41cb248f71d3`、vcs.modified=false。Vite PID 92209 / 5173；Desktop 额外端口变为 53241/53242。没有由 Codex 重启或恢复旧实例。前述 401 是初次 v0.5.25 探测结果，未用作新实例的成功或失败认证证据；真实数据面验证按指令暂跳。

清理审计：2,707 个任务前文件中 2,651 个保持原哈希，56 个变化限于 B1 实现/测试和 XGraph 上下文；新增项为本轮执行记录、7 个 fixture、3 项测试文件及实际使用的 helper。1,964 个 .generated/.expo 文件、1,936 个包内 Worklets/CSS interop 缓存逐文件哈希验证恢复或不变；没有新增生成产物。依赖/lock、Git 配置、HEAD 与暂存区保持原状。计划目录只修改总览和 T00–T03，其余 6 个任务文件保持原哈希。本轮独有的临时导出、日志、备份、审计与构建缓存目录已整体移除并验证不存在；清理审计通过。
