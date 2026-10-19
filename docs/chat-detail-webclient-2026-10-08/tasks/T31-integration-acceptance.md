# T31 跨链路联调、迁移与交付验收

[返回任务总览](../README.md)

| 项目                   | 内容                                                              |
| ---------------------- | ----------------------------------------------------------------- |
| 状态                   | [-] 本地回归通过，Android 部分交互已验收，联合验收未完成         |
| 优先级                 | 验收                                                              |
| 阶段                   | D：联合验收                                                       |
| 前置任务               | [T00](T00-protocol-baseline.md) 确定的纳入任务/任务部分及必要前置 |
| 证据类型               | 交付验收                                                          |
| 建档日期               | 2026-10-08                                                        |
| 本期范围 / 负责人 / PR | 完整目标持续执行；协议门禁未关闭 / Codex / 未创建 PR              |

## 背景与差异

单点 reducer 测试不能替代真实 Agent/Team、AP/Desktop、冷缓存、断线与 Native 资源链的联合验收。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 根据 T00 的范围结论验收已纳入任务、任务部分及必要前置，按实际影响选择总览矩阵和跨任务组合。包括单独纳入的 T10 主动压缩与 T23 复制/搜索；暂缓项记录理由，验证专项有无须修改的证据即可关闭。
2. 联网与能力校验通过后，先保存消息并提交一次 query；requestId 使用本地消息 ID。有效服务端事件确认后标记已发送；未确认断线记为失败，重连只回读详情并 attach 已确认 Run，手动重发先核对历史。
3. 运行目标链路测试、typecheck/lint 和必要 Native 验证，按实际变更决定构建范围。
4. 更新任务状态、实际提交、残留风险、灰度/回滚与 XGraph。
5. 审计清理，只删除本任务临时产物并确认用户原有改动未动。

## 当前项目接入点

- [src/features/chatRealtime/chatSyncService.ts](../../../../src/features/chatRealtime/chatSyncService.ts)
- [src/features/chatPersistence/chatRepository.ts](../../../../src/features/chatPersistence/chatRepository.ts)
- [src/features/chatTimeline/timelineReducer.ts](../../../../src/features/chatTimeline/timelineReducer.ts)
- [src/features/chatPersistence/ChatDetailScreen.tsx](../../../../src/features/chatPersistence/ChatDetailScreen.tsx)

## WebClient 参考入口

- [src/features/conversation/hooks/useConversationWsRuntime.ts](../../../../../agent-webclient/src/features/conversation/hooks/useConversationWsRuntime.ts)
- [src/features/conversation/lib/conversationReplay.ts](../../../../../agent-webclient/src/features/conversation/lib/conversationReplay.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] T00 纳入范围与必要前置均有证据，任务部分分别记录结果，不以优先级强制扩大本期验收。
- [ ] 旧数据无需删库重建。
- [ ] 真实后端与真机结果记录。
- [ ] 所有暂缓任务或任务部分明确标记范围和理由，不记为已完成。
- [ ] 新增抽象、状态和持久化能追溯到实际需求；未预建框架或形成第二套状态/恢复链路。
- [ ] 检查失败有处理结论。
- [ ] 清理完成且可复查。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatProjector.test.mts](../../../../scripts/tests/chatProjector.test.mts)
- [chatTimelineReducer.test.mts](../../../../scripts/tests/chatTimelineReducer.test.mts)
- [chatReadState.test.mts](../../../../scripts/tests/chatReadState.test.mts)
- [chatTimelineContextCompact.test.mts](../../../../scripts/tests/chatTimelineContextCompact.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 初始 P1 阶段执行记录（历史状态）

| 记录项                       | 结果                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 完成日期              | 2026-10-08 开始；本地实现完成，联合验收未完成                                                                                                            |
| 实际代码、参考代码与后端版本 | RN `64e015bf28bf12c43f50640257f3ab7d402dbb73` + 原有未提交工作树；WebClient `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；实际后端版本未知                 |
| 范围决定与协议样本           | 交付验收；AP/Desktop 与 Agent/Team 的可重复 fixture 位于 `scripts/tests`，未声称真实后端已支持                                                           |
| 变更文件与设计取舍           | P1 本地实现与协议/service 回归已落地；T00 后端版本/P2 范围及真实 Native 联调尚未完成，不标记整体完成。无新增依赖、无 lock 变更、无 storage schema 迁移。 |
| 测试命令、结果与证据位置     | 测试命令与最终结果见总览；所有 fixture 保存在 scripts/tests，临时构建/日志和生成文件恢复将在清理审计中确认。；总览记录正式检查结果                       |
| 真实后端 / Native 联调       | 待提供目标部署版本与可操作会话；读取 CoreSimulator 确认当前无已启动设备，未操作真机                                                                      |
| 迁移与回滚方式               | 聊天缓存使用 schema 9；旧 scope 首次打开时一次性清空聊天表、对应目录快照及应用管理的资源图片缓存，新版本不重复清空，高版本拒绝降级打开；认证、来源配置、远端数据和用户原始文件保留。 |
| 阻塞项与后续事项             | 真实协议样本、Native WebView/交互以及 P2 范围待确认；T31 不关闭                                                                                          |
| 临时状态清理与原有改动保护   | 任务开始前保存状态与文件基线；正式检查前另存生成文件状态；最终恢复和哈希审计见总览                                                                       |

## P1 历史本地验收（不代表当前整体交付）

类型检查、lint、Web 导出通过；正式 `pnpm test` 610/610 通过，Agent 能力补充回归后最终全量 611/611 通过。XGraph index/sync/status 通过。没有 storage schema、依赖或 lock 变更；不需要删库升级。清理审计已验证 2,389 个生成/原生文件与暂存区、范围外用户文件完整，临时产物按所有权移除，结果在总览记录。

T31 不关闭：真实后端版本/脱敏样本、Native VIEW 三入口、可见已读、停止/续聊与断线恢复操作仍须实际环境验证；P2 范围尚未确认。

## 当前完成性审计（T27 本地实施后）

| 需求/任务                                   | 权威证据                                                                                                                                   | 当前结论与缺口                                                                                                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T00 实际部署、AP/Desktop 与 Agent/Team 样本 | 本地三仓库 HEAD 与 `scripts/tests` fixtures；尚未给出部署版本/可操作联调会话                                                               | 未完成；本地 Backend 源码不等于部署契约，测试 fixture 不等于真实样本                                                                                                                                                     |
| T01–T13、T28–T30                            | timelineReducer / chatSyncService / repository / VIEW 与 time 协议实际代码；chatWebclientSync/chatWebclientService/chatViewProtocol 等回归 | 本地实现与回归通过；真实跨源、Team、断线、VIEW 三入口、可见已读和停止/续聊未联合验收。T10 仅周期；主动压缩仍属未冻结可选部分                                                                                             |
| T14–T18                                     | 单次 steer、具体技能 ID、KBASE Editing、Run 权限和 selection 代码及专项测试                                                                | 本地最小范围落地；队列/重启恢复/自动转 query 不自动纳入，真实 Native 交互仍未验收                                                                                                                                        |
| T19 聊天/Site 引用                          | ChatContextReferencePicker、chatContextReferences 等实际测试                                                                               | 聊天引用本地落地；Native Site 目录/host bridge 不存在，选择与重发明确关闭，完整 Site 能力未完成                                                                                                                          |
| T20 图像生成                                | chatImageGeneration / gallery 与实际测试                                                                                                   | 本地投影、冷快照、图片缓存通过；AP/Desktop 真实资源与 Native 图像交互未验收                                                                                                                                              |
| T21 反馈                                    | 当前后端 thumbs_down/clear 与 chatRunFeedback 测试                                                                                         | 点踩/清除本地落地；点赞后端契约不存在，未把点赞算作完成                                                                                                                                                                  |
| T22 派生                                    | 服务端 derive 契约、rich snapshot 意图及 chatDerivation/service 测试                                                                       | 本地确认/未知恢复与目录接线通过；真实上下文/资源重写、权限与 Native 导航未验收                                                                                                                                           |
| T23、T26                                    | transcript/search/fileChanges 实际组件和投影测试                                                                                           | 已加载范围的本地实现通过；原生手势/定位/面板/资源预览仍待真实验收，不把已加载内容冒充完整历史                                                                                                                            |
| T24 导出分享                                | 用户已安装 expo-sharing `56.0.15`；chatExport/service/protocol 与 Native/Web 交付及 13 项专项测试                          | 默认源本地导出/分享已落地，715 项回归通过；HTML 部署域名/版本、paired 数据面与真实 Native 重建/交付仍未验收                                                                                                             |
| T25 BTW                                     | Backend ws_query_routes/controlscope、HTTP btw/attach/interrupt；T25 第 2 步要求复用共享 transport                                         | 功能未实施；普通共享 WS 无法启动 BTW，跨 HTTP/WS 控制被拒绝。必须先确认允许的移动端共享通道，或明确采用 HTTP 全链路及 AP/Desktop 路由/认证；不预建不可用的隔离引擎                                                       |
| T27 Office                                  | Document preview capability/prepare、默认源静态身份、实际 service/组件与账号切换取消测试                                                   | 默认源在线转换/系统浏览器本地落地；paired HTTP 通道/实际 Document Hub 配置与 Native 打开/下载未验收                                                                                                                      |
| 技能目录读取 id，单次选择经 references 的 skill 引用提交；TEAM 同样按根 agentKey 和 interactionConfig 校验能力，不单独持久化待重放发送选项。 | database.ts/schema.ts 的实际字段与 chatEditingMode 真实内存 SQLite 迁移测试，目录 repository 回归                                          | P2 增加 `editing_mode INTEGER NOT NULL DEFAULT 0` 与 `must_use_skills_json TEXT NOT NULL DEFAULT '[]'`，旧 pending 行与已有值保留、重复初始化幂等；无删库/新操作表。旧 Native 安装升级仍需真机，不再声称“无 schema 变更” |
| 性能与过度设计/旧代码                       | 有界输出/VIEW/cache/虚拟列表/按节点引用复用的计数与行为测试；`tsc --noUnusedLocals --noUnusedParameters`                                   | 技能目录读取 id，单次选择经 references 的 skill 引用提交；TEAM 同样按根 agentKey 和 interactionConfig 校验能力，不单独持久化待重放发送选项。 |
| 本地质量门禁与交付                          | T27 最终全量 702/702、tsc/lint/Web 导出；每轮基线/暂存区/生成文件清理审计                                                                  | 本地门禁通过，不替代以上真实门禁；没有创建 PR、发布或合并                                                                                                                                                                |

### 本次环境复核

`adb devices -l` 在读取已有 PID 14078 服务后返回空设备列表；`xcrun simctl list devices booted --json` 返回 iOS 26.3/26.4 均无已启动设备。最初沙箱读取被系统连接权限限制；后续只读权限提升成功。没有启动设备、安装 App、改配置或替换已有 ADB 服务。

沙箱内 ADB 探测曾自动尝试启动进程并写入系统诊断日志 `/var/folders/9k/kbqbpx613vdb3gc_js65wr080000gn/T/adb.501.log`，启动失败；无法确认该日志原有内容/所有权，因此保留，不作为可删除的 Codex 临时文件。该日志当前 27 行中有 7 行标记本次 PID 30249，其余 20 行不归本次探测；不删除整个文件。若用户有探测前日志备份，可手动 `cp <探测前日志备份> /var/folders/9k/kbqbpx613vdb3gc_js65wr080000gn/T/adb.501.log` 恢复；没有备份时先保留并核对，不猜测原始内容。其余本轮 owned 审计临时产物按总览清理。任务仍未完成，保留该日志不阻止继续安装/联调。

依赖安装、移动端 BTW 契约、部署版本与实际联调条件已请求补充。缺口与各任务逐项对应，不将 T24/T25、Site、点赞、可选压缩或真实 Native 验收改名为已完成。

## 本轮继续执行（暂跳过 T25）

本轮按用户最新指令暂跳过 T25 及 BTW 相关验收；这调整了纳入范围，不将缺失功能记为完成。T26–T30 没有 T25 前置，已继续执行 64/64 专项回归，覆盖文件修改/Office 资源及快照交接、序列/共享 Socket、中断/迟到结果隔离等实际代码。T31 其余独立验收保持进行中，T24 依赖安装、真实部署/Native 条件不因跳过 BTW 而自动通过。

本轮只改范围与证据记录；未修改业务实现、依赖或锁文件。临时状态清理见总览本轮审计。

## T24 安装后最新门禁

用户完成依赖安装，本轮没有修改 package/lock；默认源服务端完整文件导出及显式分享的本地协议/组件/Native 交付测试 13/13，全量 715/715、严格 tsc 与 lint 通过。HTML 无凭据模板请求与实际 WebClient 构建模板兼容通过，真实资产域名/版本、资源认证与真机仍未验收；paired 来源明确不可用。临时资源仅本次操作持有，系统分享结束后回收，真实目标应用读取/进程强杀场景仍需 Native 验收。T25/BTW 暂跳过，其他部署和 Native 门禁不关闭。

### 本轮验证与清理审计

2026-10-08：专项 13/13、全量 pnpm test 715/715、严格 tsc（含 noUnusedLocals/noUnusedParameters）、pnpm lint、生产 Web 与 Android 静态导出、实际 WebClient HTML 模板兼容均通过；静态导出不等于 Native 二进制重建或真实分享验收。XGraph index/sync/status 通过。所有新增代码均接入实际入口，没有未使用的旧版导出实现或空框架。

2,009 个已记录的项目生成/Native 文件中，仅 .expo/dev/logs/export.log 被本次导出写入，已从任务前副本恢复；没有新生成文件。用户安装后的 package/lock、暂存区、Git 配置及范围外原有业务改动保持原样。自建 Web/Android 导出、日志和临时备份将在最终审计后删除。

**清理审计保留项，不能记为完全恢复：**仓库现有 pnpm prepare:bundle 会重建 node_modules 内 react-native-worklets/.worklets 的 1,927 个构建缓存。此前只备份了项目生成物，未记录包内缓存的任务前原始哈希；不伪称按原字节恢复。重建后的 1,927 个文件与任务前 .generated/react-native-worklets/.worklets 项目副本逐一匹配（按原有 import 路径重映射比较），Android 导出未再改变包内缓存。该缓存保留，不删除所有权不明确的安装产物；完整清理审计与整个目标仍未关闭。

保留路径为 /Users/ther/project/zenmind-workspace/zenmind-react-app/node_modules/.pnpm/react-native-worklets@0.8.3_ksoiso4lpwamioqvult67vlgpy_dcfvlxbpaung5ijf4xc6euq5aa/node_modules/react-native-worklets/.worklets。若用户持有任务前该目录的完整备份，可手动用 `rsync -a --delete /path/to/pre-task-worklets/ /Users/ther/project/zenmind-workspace/zenmind-react-app/node_modules/react-native-worklets/.worklets/` 恢复并核对；没有原目录备份时不能证明精确撤回。`pnpm prepare:bundle` 仅重现当前源码一致的缓存，不是原字节恢复命令。后续构建前须先记录包内缓存。

最终审计：662 个基线文件中 637 个保持原哈希，25 个变化限于 T24 入口/中英文、执行记录和 XGraph 派生；新增 8 个接入/协议/平台声明及专项测试文件。2,009 个项目生成/Native 文件恢复或不变，无新生成文件，package/lock/暂存区与原有 authRequestModel 删除保持用户原状；本轮自建临时目录（含导出、日志、基线、复制的缓存备份）已移除并验证。包内 Worklets 缓存按上述审计保留，未宣称精确恢复；整体清理审计仍不完整。

## Android 真机继续验收（2026-10-08）

用户运行 `android:device:zenmind` 后，ADB 确认 OnePlus 6T（ONEPLUS_A6010，Android 10），`com.zqfrank.agentterminalapp` 为前台 debug 构建，versionName 1.0.0，最后安装时间 18:04:51；Expo SharingFileProvider 已注册。沿用用户已有 ADB 服务和 `tcp:8081` reverse，没有重新安装、清库或改配置。实际后端部署版本仍未知，以下只记录已操作场景。

| 场景 | 真机结果与边界 |
| --- | --- |
| 现有历史与 run | 现有配对 Desktop 会话恢复完成回答、时间/耗时和用量；完成 run 默认折叠，点击展开显示思考过程等原节点，收起可用。未覆盖 Team、活动流、停止/续聊和断线恢复。 |
| T23 正文搜索 | 输入 `HTTP` 得到 1/1、正文源码片段与对应回答定位；上一处/下一处入口和关闭可操作，明确提示仅已加载正文、不含工具输出。未把该短历史当作长列表性能验收。 |
| T26 文件修改 | 已加载范围说明与“暂无可靠的文件修改结果”空态正确，开关面板可用；该会话无写文件结果，实际 diff/文件预览未验收。 |
| T18 引用选择 | 回答引用打开原正文范围面板，原生长按出现全选菜单、全选后取消可用；未保存引用、批注或发送，因此端到端提交仍未验收。 |
| T15 技能 | 横向工具栏可访问技能；真实列表加载显示名称及 local-pdf 等具体 ID，按 `local-pdf` 搜索仅保留对应项。未更改技能选择、发送或重启恢复。 |
| T17 后续消息权限 | 三种权限选项及说明可打开/取消；未更改默认值，活动 run 权限操作未验收。 |
| T19 聊天引用 | 同来源目录加载并排除当前聊天，标题/ID 和已加载搜索范围可见，取消可用；未选入/发送，Site 按原范围保留缺口。 |
| T24 来源降级 | 当前会话为 paired 来源；保存和分享 Markdown 均显示“此来源或设备暂不支持导出与分享”，未打开系统文件选择/分享、未留下 chat-export 缓存。资产域名缺失时 HTML 操作隐藏并有提示。这是负向验收通过，不是文件交付通过。 |

发现并修复：18:15:49 打开文件修改面板触发重复 React key；搜索栏和文件面板同级且均以 conversationId 为 key。改为 `search:` / `file-changes:` 前缀，保留切会话重置；导出入口也加 `export:` 前缀，避免与同级聊天引用面板重名。没有新状态/抽象/存储。热更新后连续开关面板、搜索以及聊天引用面板无新增同 key 警告；本轮采集范围未发现 FATAL EXCEPTION。

验证：相关 24/24，全量 `node --no-warnings --test --experimental-transform-types scripts/tests/*.test.mts` 715/715，`pnpm exec tsc --noEmit --noUnusedLocals --noUnusedParameters` 与 `pnpm lint` 通过。复用用户生成物，未再次运行 prepare/build，未写入依赖或 lock。

剩余门禁：默认 API 仍为 example.invalid 示例地址，已请求可用默认 AP 配置/会话；成功导出、系统保存/分享/取消、目标应用读取、HTML 资产部署仍未验收。Agent/Team、旧安装升级、真实资源/VIEW/Office、运行控制与断线及长列表性能场景继续保留。T25 及 BTW 相关验收仍跳过。临时截图/XML/日志仅用于本轮检查，含会话正文的不保留进仓库；清理结果另附审计。

本轮清理审计：670 个基线文件中 653 个保持原哈希，17 个变化只涉及两处组件接线、现有 Native 回归、任务记录与 XGraph 派生；无新增/遗漏文件。package/lock、暂存区及范围外原有改动不变，原有 authRequestModel 删除保持原状。未运行生成/安装脚本，用户运行的开发服务器与其缓存保留。设备恢复至 Chat 首页，唯一 owned `/data/local/tmp/zenmind-qa-c57xtfzq.xml` 已删除并验证不存在，App cache 无 chat-export 目录；原 ADB PID 14078、8081 reverse 与系统 ADB 日志哈希保持不变。本轮 owned 宿主截图、XML、日志、基线和审计目录删除并验证不存在。`git diff --check` 与 XGraph sync/status 通过。此前包内 Worklets 原字节恢复的保留项仍按上节记录，未因本轮清理而关闭。
