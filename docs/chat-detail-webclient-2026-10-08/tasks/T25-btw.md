# T25 顺便问 BTW 独立会话

[返回任务总览](../README.md)

| 项目                   | 内容                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| 状态                   | [ ] 暂跳过（本轮按上下文理解为 T25）                                                         |
| 优先级                 | P2                                                                                           |
| 阶段                   | C：能力扩展（按范围选择）                                                                    |
| 前置任务               | [T05](T05-run-owner.md)、[T18](T18-selection-references.md)、[T29](T29-sequence-recovery.md) |
| 证据类型               | 静态差异                                                                                     |
| 建档日期               | 2026-10-08                                                                                   |
| 本期范围 / 负责人 / PR | 用户要求暂跳过；不实施依赖部分 / Codex / 未创建 PR                                           |

## 背景与差异

WebClient 已将 BTW 设计为独立会话状态；不能复用主聊天 outbox、未读或摘要状态而造成互相污染。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 冻结 BTW API 和引用输入契约，建立独立 session/run 实例、订阅及存储归属；只有明确的恢复需求才新增持久化，不能让 BTW 写入主会话的 outbox、未读或摘要。
2. 复用共享 transport，并直接复用实际适用的纯协议解析、投影、序列化与鉴权资源能力。业务状态实例保持隔离，不复制整套聊天系统，也不预先抽象通用会话引擎。
3. 实现独立发送、恢复、取消和收起。
4. 明确资源与订阅回收，只移除自身监听。

## 当前项目接入点

- [src/features/chatRealtime/chatSyncService.ts](../../../../src/features/chatRealtime/chatSyncService.ts)
- [src/features/chatPersistence/chatRepository.ts](../../../../src/features/chatPersistence/chatRepository.ts)
- [src/core/ws/sharedWsTransport.ts](../../../../src/core/ws/sharedWsTransport.ts)

## WebClient 参考入口

- [src/features/btw/lib/btwRuntime.ts](../../../../../agent-webclient/src/features/btw/lib/btwRuntime.ts)
- [src/features/btw/lib/btwSend.ts](../../../../../agent-webclient/src/features/btw/lib/btwSend.ts)
- [src/features/btw/lib/btwPersistence.ts](../../../../../agent-webclient/src/features/btw/lib/btwPersistence.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 主会话运行不受 BTW 影响。
- [ ] BTW 不改变主会话未读/摘要/outbox。
- [ ] 状态实例、订阅和存储归属隔离；复用适用纯函数，没有重复投影或预建通用会话引擎。
- [ ] 取消仅影响 BTW。
- [ ] 断线恢复不重复发送。
- [ ] 关闭不会停止共享 socket。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [wsClientTransport.test.mts](../../../../scripts/tests/wsClientTransport.test.mts)
- [chatRealtimeRouting.test.mts](../../../../scripts/tests/chatRealtimeRouting.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录（实施时填写）

| 记录项                       | 结果                       |
| ---------------------------- | -------------------------- |
| 开始 / 完成日期              | 待填写                     |
| 实际代码、参考代码与后端版本 | 待填写                     |
| 范围决定与协议样本           | 待填写                     |
| 变更文件与设计取舍           | 待填写                     |
| 测试命令、结果与证据位置     | 待填写                     |
| 真实后端 / Native 联调       | 待填写                     |
| 迁移与回滚方式               | 待填写；不得以删库代替迁移 |
| 阻塞项与后续事项             | 待填写                     |
| 临时状态清理与原有改动保护   | 待填写                     |

## 本次范围记录

2026-10-08：已核对 WebClient `eeec6f12b29bdf440b47b3d6f108aba67981e2ea` 与 Backend `b60bbf8a67e02cb569e90e08691b0821537438c6`；尚未新增 BTW 业务代码。`POST /api/btw` 的 HTTP 启动可用，`GET /api/attach`（lastSeq/SEQ_EXPIRED）与 `POST /api/interrupt` 也有 HTTP 控制路径，必须沿同一 transport、subject、boundary 完成恢复与取消；不能 HTTP 启动后借主 WS 控制。

后端 `internal/server/ws_query_routes.go` 只允许 Desktop BTW/Explain 专用物理 WS 通道发起；`internal/runtime/controlscope/scope.go` 对跨 transport 返回 `run_transport_mismatch`，WS 跨 lane 返回 `run_lane_mismatch`。移动端现有共享 WS 是主通道，不冒用 Desktop 专用身份。WebClient 的 HTTP 启动/普通 WS 控制组合也不能作为当前后端契约证明。

HTTP 全链路可行性已确认，仍需冻结 Native 默认源与配对 Desktop 源可用的 HTTP 路由及认证，或后端允许的共享 WS BTW 通道；不能用仅资源下载已确认的路由推断 BTW/attach/interrupt 均可访问。后续实现复用现有纯 timeline/引用/资源函数并隔离 session，禁止写主会话摘要/outbox/未读，不预建通用会话引擎。真实部署/Native 与重连、取消、收起和订阅回收验收仍待完成。

## 实施前契约门禁

本次再次确认：计划第 2 步要求复用共享 transport，而当前 Backend 的普通主 WS 不允许启动 BTW，HTTP Run 不能借 WS 恢复/取消。已请求确认移动端可用的共享通道，或完整 HTTP 策略及两类来源路由/认证。确认前不创建不可用入口、独立协议引擎或假冒 Desktop 专用 lane；任务功能仍未实施。该缺口是实际后端与计划的冲突，不是实现难度或可选 UI 偏好。

## 本轮范围调整

用户要求“该任务先跳过，继续后面的任务，如有依赖该任务完成的也先不进行”。本轮按紧接的 BTW 契约阻塞上下文理解为 T25；已提供 T24/T25 选择澄清，尚未收到回复，先按 T25 更新这一可逆范围记录。

T25 未有业务代码，不新增入口/service/store。按所有任务头部依赖解析，T26–T30 无直接或传递 T25 前置；T31 按纳入范围验收，因此 BTW 相关联调暂跳过，其余独立项继续。跳过不是功能完成，也不把 T24 分享、T27 默认源在线预览或 T31 的其他真实门禁一并视为完成/排除。
