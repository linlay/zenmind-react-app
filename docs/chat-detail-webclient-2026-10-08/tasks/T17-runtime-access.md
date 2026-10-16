# T17 运行中访问级别变更

[返回任务总览](../README.md)

| 项目                   | 内容                                                      |
| ---------------------- | --------------------------------------------------------- |
| 状态                   | [-] 本地实现完成，待真实联调                              |
| 优先级                 | P2                                                        |
| 阶段                   | C：能力扩展（按范围选择）                                 |
| 前置任务               | [T05](T05-run-owner.md)、[T12](T12-agent-capabilities.md) |
| 证据类型               | 静态差异                                                  |
| 建档日期               | 2026-10-08                                                |
| 本期范围 / 负责人 / PR | 纳入本期最小范围 / Codex / 未创建 PR                      |

## 背景与差异

WebClient 提供运行期间访问级别更新；当前运行设置与未来默认配置需要分开处理。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 接入运行级访问更新 endpoint 与 owner/runId。
2. 同一 owner/chat/run 同时只允许一次修改，service 提交互斥且 UI 提交中禁用重复修改；不增加并发变更队列。异步结果仍复核当前身份，不能仅靠忽略旧响应来保证服务端写入顺序。
3. 明确拒绝时恢复最近已确认值；超时按未知结果处理，经现有权威查询或事件校准实际值，在核对前不重发也不把旧值声称为服务端真实值。权威值无法取得时显示未知并保留用户可操作的提示，不增加后台轮询系统。
4. 将当前 run 值与 Agent 后续默认值分开展示，复用现有运行态保存服务端确认值，不为该操作建立第二套 run 状态或额外持久化。

## 当前项目接入点

- [src/core/api/services/chatApi.ts](../../../../src/core/api/services/chatApi.ts)
- [src/features/chatRealtime/chatSyncService.ts](../../../../src/features/chatRealtime/chatSyncService.ts)
- [src/features/chatPersistence/components/Composer.tsx](../../../../src/features/chatPersistence/components/Composer.tsx)

## WebClient 参考入口

- [src/features/composer/hooks/useRuntimeAccessLevel.ts](../../../../../agent-webclient/src/features/composer/hooks/useRuntimeAccessLevel.ts)
- [src/shared/data/api/endpoints.ts](../../../../../agent-webclient/src/shared/data/api/endpoints.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 连续点击只产生一个在途修改；确认后才能再次修改，界面与服务端实际值一致。
- [ ] 明确拒绝恢复已确认值，超时显示未知并可校准，不以旧乐观值伪装真实值。
- [ ] 切换会话后旧响应不回写。
- [ ] 当前 run 修改不意外改变后续默认。
- [ ] 结束 run 不再接受无效变更。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatWsTransportPayload.test.mts](../../../../scripts/tests/chatWsTransportPayload.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项                       | 结果                                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 完成日期              | 2026-10-08 本地实现；真实业务验收待完成                                                                                                                                                                                                                                                                                      |
| 实际代码、参考代码与后端版本 | React HEAD `64e015bf28bf12c43f50640257f3ab7d402dbb73`，包含任务开始前工作区改动；WebClient HEAD `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；本地 Backend HEAD `b60bbf8a67e02cb569e90e08691b0821537438c6`，工作树干净；实际部署未知                                                                                           |
| 范围决定与协议样本           | 接入 `/api/access-level`，请求 requestId/runId/canonical owner/accessLevel/reason；accepted/runId/accessLevel/version 确认；`run.access_level.changed` 按单调 version 校准。证据：Backend contracts/queryinput/control.go、runtime/runstate/manager.go、stream/assembler.go；WebClient endpoints.ts/useRuntimeAccessLevel.ts |
| 变更文件与设计取舍           | chatApi/eventProtocol、chatSyncService、timeline RunNode/reducer/serializer/helper、chatProjector、controller/composer option menu 与中英文文案。当前权限和未来默认分离，同 run 物理互斥，预检/响应复核身份，超时不重发；仅既有 reconcile/手动核对，无轮询、队列、额外表或第二套 run 状态                                    |
| 性能与回放                   | 确认权限写既有 rich snapshot，sending/unknown 排除 snapshot 且不调度额外 SQL；controller 按缓存 RunNode ID 读取，顺序/run 不变时不扫描历史。query 初始元数据适配实际 query→run.start 顺序；按 runId 合并跨 request 身份，保持最高确认版本与真实终态/耗时                                                                     |
| 测试命令、结果与证据位置     | 新增 chatRunAccess.test.mts、chatRuntimeAccessMenu.test.mts，扩展 chatWebclientService.test.mts；最终定向 38/38、全量 648/648 通过，pnpm exec tsc --noEmit 与 pnpm lint 通过，无 warning；Web 导出通过                                                                                                                       |
| 真实后端 / Native 联调       | 未完成。需部署版本、登录会话与 Native 操作环境，覆盖 Agent/Team、AP/Desktop、快速点击、断网未知与跨会话响应。Web 导出不替代 Native 验收                                                                                                                                                                                      |
| 迁移与回滚方式               | 聊天缓存使用 schema 9；旧 scope 首次打开时一次性清空聊天表、对应目录快照及应用管理的资源图片缓存，新版本不重复清空，高版本拒绝降级打开；认证、来源配置、远端数据和用户原始文件保留。 |
| 阻塞项与后续事项             | 后端 detail 未证明可返回未变化的当前权限版本；超时且无更新事件时保留未知，不将旧版本称为已校准，用户可手动核对或结束 run。T00/T31 真实样本待验证，整体继续后续任务                                                                                                                                                           |
| 临时状态清理与原有改动保护   | 执行前保存 625 个基线文件哈希与暂存区；生成文件恢复及最终清理结果见下文                                                                                                                                                                                                                                                      |

## 本次范围记录

纳入计划规定的最小运行权限范围；没有扩展 Agent 全局默认保存，未来 query 默认继续原有输入区状态。旧执行分支只保留仍服务真实协议、旧 SQLite 与历史回放的兼容；不为新权限另建 store 或通用协议引擎。

验收清单保持未勾选以等待真实服务端/Native 联合证明；本地专项已覆盖相应数据与服务路径，不能据此宣称线上业务完成。

本轮最终验证：全量 `node --no-warnings --test --experimental-transform-types scripts/tests/*.test.mts` 648/648，定向 38/38，类型检查、lint、Web 导出与 XGraph status 均通过。补充 source lifecycle 改变时旧 RPC 不写替换状态，以及 submitting/unknown 不触发额外 snapshot SQL 的回归。

清理审计：625 个执行前基线文件中 586 个哈希不变、39 个仅 T17 代码/测试、执行记录与 XGraph 派生变化；新增 helper 与两份专项测试共 3 个文件。暂存区一致，1,964 个 `.expo`/生成文件恢复或不变，无新生成产物。临时基线、日志、导出与生成状态备份按本轮所有权移除并复核；无依赖、lock、Git 配置/分支/远程/凭据改动，原有用户文件保持。
