# T22 从指定 Run 派生对话

[返回任务总览](../README.md)

| 项目                   | 内容                                              |
| ---------------------- | ------------------------------------------------- |
| 状态                   | [-] 当前协议本地实现完成；待真实验收              |
| 优先级                 | P2                                                |
| 阶段                   | C：能力扩展（按范围选择）                         |
| 前置任务               | [T05](T05-run-owner.md)、[T07](T07-read-state.md) |
| 证据类型               | 静态差异                                          |
| 建档日期               | 2026-10-08                                        |
| 本期范围 / 负责人 / PR | 按完整目标推进 / Codex / 未创建 PR                |

## 背景与差异

WebClient 支持以 sourceChatId/sourceRunId 派生；移动端尚未接入，对应旧清单 TODO-20。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 调用服务端派生接口保留上下文，不能用复制 query 模拟。
2. 验证可派生的 run 与 owner。
3. 将返回新会话写入 repository、刷新 MMKV 目录并导航。
4. 超时未知结果不自动重复创建，提供可核对的恢复方式。

## 当前项目接入点

- [src/core/api/services/chatApi.ts](../../../../src/core/api/services/chatApi.ts)
- [src/features/chatPersistence/chatRepository.ts](../../../../src/features/chatPersistence/chatRepository.ts)
- [src/features/chatPersistence/useChatDetailConversationController.ts](../../../../src/features/chatPersistence/useChatDetailConversationController.ts)

## WebClient 参考入口

- [src/features/conversation/hooks/useDeriveChatAction.ts](../../../../../agent-webclient/src/features/conversation/hooks/useDeriveChatAction.ts)
- [src/features/chats/lib/chatDerivation.ts](../../../../../agent-webclient/src/features/chats/lib/chatDerivation.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 派生上下文准确。
- [ ] 新会话立即进入正确目录。
- [ ] 重复点击不重复创建。
- [ ] 接口失败保持原会话。
- [ ] 未知结果可恢复。
- [ ] Team 与权限失效处理正确。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatDirectoryProjector.test.mts](../../../../scripts/tests/chatDirectoryProjector.test.mts)
- [chatDetailNavigation.test.mts](../../../../scripts/tests/chatDetailNavigation.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项                       | 结果                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 完成日期              | 2026-10-08：当前本地协议实现；真实验收未完成                                                                                                                                                                                                                                                                                |
| 实际代码、参考代码与后端版本 | React HEAD `64e015bf28bf12c43f50640257f3ab7d402dbb73` + 当前工作树；WebClient `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；Backend `b60bbf8a67e02cb569e90e08691b0821537438c6` 本地只读对照；部署版本待 T00                                                                                                                   |
| 范围决定与协议样本           | Backend `internal/server/handler_chat_delete.go`、`internal/chat/derive.go` 和 `internal/api/types.go`：/api/chat/derive 接受 sourceChatId/sourceRunId/客户端 chatId，返回新的 Run ID、copiedRuns 与 owner；按指定 Run 截断、重写上下文/资源，不能以复制 query 替代。历史双 owner Team 由后端拒绝，canonical Team 仅 teamId |
| 变更文件与设计取舍           | 新协议校验、RunNode 最小恢复意图、memo 按钮；service 创建前 await 现有 rich snapshot 持久化目标，未知/ready 只 GET 精确 ID。复用 repository、MMKV 目录刷新、timeline merge 和 controller replace；不加 schema、操作表、outbox、重试轮询或依赖。既有“新会话重问”仍是不同能力，保留；本任务没有旧派生模拟实现可删除           |
| 测试命令、结果与证据位置     | 定向 50/50、全量 684/684；node --no-warnings --test --experimental-transform-types scripts/tests/指定文件或全部 \*.test.mts；pnpm exec tsc --noEmit、pnpm lint、Web 导出、xgraph sync/status 和 git diff --check 通过；专项证据见 chatDerivation.test.mts、chatWebclientService.test.mts、chatSource.test.mts               |
| 真实后端 / Native 联调       | 未完成；本地源码/host 测试/Web 导出不能替代实际 AP/Desktop/Native 验收                                                                                                                                                                                                                                                      |
| 迁移与回滚方式               | 复用 rich timeline JSON 可选字段，旧快照无字段仍兼容；不删库。回滚关闭 UI/API，既有恢复 ID 保留，禁止自动重发                                                                                                                                                                                                               |
| 阻塞项与后续事项             | T00/T31 实际部署需确认客户端 chatId 协议；真实多轮上下文、资源重写、Team 权限、目录与 Native 导航待联合验收。未知目标 404 仍保持核对，不猜测新目标或自动重建                                                                                                                                                                |
| 临时状态清理与原有改动保护   | 642 个基线中 608 个保持原哈希，34 个变化限于本任务代码/测试/记录与 XGraph 派生，新增协议/helper/按钮/测试 4 文件；暂存区一致，依赖/lock/配置不变；1,964 个生成文件恢复或不变，无新生成文件。临时备份、日志与导出按所有权移除，原有用户改动保留                                                                              |

## 本次范围记录

2026-10-08：按完整执行目标推进 T22。完成 Run 才显示派生；当前有 run/awaiting 时不新建。物理互斥覆盖预检、落盘与请求；明确创建拒绝清意图，目标查询失败不得清意图。响应/source 生命周期核对后才合并服务端历史、更新 owner 目录和返回导航数据；已切页面不导航。已确认目标再次点击只打开同一个派生对话，未知结果按钮只查询记录的 ID。运行中正文不逐帧重建 Run 索引，无额外全局状态或队列。

本任务复用 source scoped ID、严格远端时间、server detail 投影、rich snapshot 保存/合并；专项覆盖重复点击、创建前存储失败、超时冷恢复、404/403、明确拒绝、错误确认、Team、切 source、旧详情与新目标 runtime、实际 controller 与 Native 按钮。实时不新增事件协议，派生目标沿用普通 chat.created/updated 和 detail/reconcile；旧缓存不加 SQL 迁移。

本轮本地验证与清理完成，实际后端/Native 联合验收仍未完成；本任务保持 [-]，整体目标继续 T23–T27。
