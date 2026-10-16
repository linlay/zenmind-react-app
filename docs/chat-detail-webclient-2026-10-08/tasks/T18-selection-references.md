# T18 划词引用与批注数据

[返回任务总览](../README.md)

| 项目                   | 内容                             |
| ---------------------- | -------------------------------- |
| 状态                   | [-] 本地实现完成，待真实联调     |
| 优先级                 | P2                               |
| 阶段                   | C：能力扩展（按范围选择）        |
| 前置任务               | [T08](T08-query-continuation.md) |
| 证据类型               | 静态差异                         |
| 建档日期               | 2026-10-08                       |
| 本期范围 / 负责人 / PR | 纳入本期 / Codex / 未创建 PR     |

## 背景与差异

WebClient 增加选中文本引用与 annotation/annotationIndex；当前附件归一偏向文件，可能丢失这类非文件字段。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 新增选择引用结构并完整透传 text/annotation/annotationIndex。
2. 编号限定到对应 chat/run，发送后历史稳定、未发送状态按生命周期清理。
3. 实现适合 Native 的文本选择入口，避免依赖浏览器 DOM。
4. 联网与能力校验通过后，先保存消息并提交一次 query；requestId 使用本地消息 ID。有效服务端事件确认后标记已发送；未确认断线记为失败，重连只回读详情并 attach 已确认 Run，手动重发先核对历史。

## 当前项目接入点

- [src/features/chatPersistence/chatAttachmentModels.ts](../../../../src/features/chatPersistence/chatAttachmentModels.ts)
- [src/features/chatPersistence/chatProjector.ts](../../../../src/features/chatPersistence/chatProjector.ts)
- [src/features/chatPersistence/components/Composer.tsx](../../../../src/features/chatPersistence/components/Composer.tsx)

## WebClient 参考入口

- [src/features/selection/hooks/useSelectedTextFragments.ts](../../../../../agent-webclient/src/features/selection/hooks/useSelectedTextFragments.ts)
- [src/shared/contracts/selectedTextReference.ts](../../../../../agent-webclient/src/shared/contracts/selectedTextReference.ts)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [ ] 纯文字引用不被文件过滤器丢弃。
- [ ] 编号稳定且不串会话。
- [ ] 失败恢复引用与批注。
- [ ] 运行结束清理未发送临时状态。
- [ ] 复制和展示不泄露无关选区。
- [ ] 补齐本任务实际变更的实时、回放和冷启动场景；不适用项写明理由。
- [ ] 更新执行记录、必要的 XGraph 上下文并完成清理审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatProjector.test.mts](../../../../scripts/tests/chatProjector.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项                       | 结果                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 完成日期              | 2026-10-08 本地实现；实际业务验收待完成                                                                                                                                                                                                                                                                                                                                                   |
| 实际代码、参考代码与后端版本 | React HEAD `64e015bf28bf12c43f50640257f3ab7d402dbb73` 加已有工作区改动；WebClient HEAD `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；本地 Backend `b60bbf8a67e02cb569e90e08691b0821537438c6`，实际部署版本待 T00                                                                                                                                                                            |
| 范围决定与协议样本           | selection 保留 id/type/text/annotation/annotationIndex，sourceKind 为可选 client meta；不携带文件 URL、sha256、路径能力。核对 WebClient selectedTextReference/useSelectedTextFragments 与 Backend contracts/queryinput/selection.go/input.go、runtime/reference/prepare.go。query 和 steer 使用同一 reference                                                                             |
| 变更文件与设计取舍           | chatAttachmentModels/types 与 chatSelectionReference helper；复用附件 hook、附件条、composer、controller 和 TimelineList。新增按需选择/批注面板，无第二份草稿 store、数据库表、依赖或 DOM/剪贴板读取                                                                                                                                                                                      |
| 编号和生命周期               | 联网与能力校验通过后，先保存消息并提交一次 query；requestId 使用本地消息 ID。有效服务端事件确认后标记已发送；未确认断线记为失败，重连只回读详情并 attach 已确认 Run，手动重发先核对历史。 |
| 性能和交互                   | 只有点击消息引用入口才打开原生选区控件；使用 onSelectionChange 读取本消息选区并拒绝半个 emoji/非法/超长范围。最长选区 50,000 字符，超长源按需 100,000 字符窗口、50,000 步长重叠分页；不丢源的后半段，不每帧扫描历史。编号使用缓存当前 run 的 message IDs，只读这些节点的 reference 元数据。附件条点击可查看引用，草稿可编辑批注，历史只读；批注输入上限 10,000 字符，协议恢复保留历史全文 |
| 测试命令、结果与证据位置     | 联网与能力校验通过后，先保存消息并提交一次 query；requestId 使用本地消息 ID。有效服务端事件确认后标记已发送；未确认断线记为失败，重连只回读详情并 attach 已确认 Run，手动重发先核对历史。 |
| 真实后端 / Native 联调       | 未完成。React host 测试验证生产组件回调；Native 原生长按、选区拖动、键盘和双平台真实交互待 T31。TextInput API 核对 https://reactnative.dev/docs/textinput.html；Android 原生 editable=false 会禁用 EditText，因此保持受控内容、关闭自动软键盘并即时恢复任何编辑；iOS 使用只读选择                                                                                                         |
| 迁移与回滚方式               | 聊天缓存使用 schema 9；旧 scope 首次打开时一次性清空聊天表、对应目录快照及应用管理的资源图片缓存，新版本不重复清空，高版本拒绝降级打开；认证、来源配置、远端数据和用户原始文件保留。 |
| 阻塞项与后续事项             | 实际 AP/Desktop/Agent/Team 样本与 Native 操作待 T00/T31；完整目标继续 T19–T27                                                                                                                                                                                                                                                                                                             |
| 临时状态清理与原有改动保护   | 执行前保存基线文件哈希/暂存区，记录生成产物状态；最终审计见下文                                                                                                                                                                                                                                                                                                                           |

## 本次范围记录

联网与能力校验通过后，先保存消息并提交一次 query；requestId 使用本地消息 ID。有效服务端事件确认后标记已发送；未确认断线记为失败，重连只回读详情并 attach 已确认 Run，手动重发先核对历史。

验收清单待真实联调后勾选；本地验证不能替代线上契约和 Native 选区手势验收。

最终检查：定向 40/40、全量 `node --no-warnings --test --experimental-transform-types scripts/tests/*.test.mts` 657/657、`pnpm exec tsc --noEmit`、`pnpm lint`、Web 导出与 XGraph status 通过。后端会去掉 client meta，echo identity 只使用其保留的选择字段；可选来源缺失不会制造第二个气泡。

清理审计：628 个基线中 590 个哈希不变，38 个变化限于 T18 代码/测试、执行记录与 XGraph 派生，新增 4 个任务文件；暂存区相同，1,964 个 `.expo`/生成文件恢复或不变，无新生成文件。临时基线、日志、导出及生成备份已按所有权移除并复核，原有用户状态保留，无依赖、lock、Git 配置/分支/远程改动。真实 Native/部署验收仍待完成，本任务保持进行中。
