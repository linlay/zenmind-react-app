# T27 DOCX 与 Office 资源预览

[返回任务总览](../README.md)

| 项目                   | 内容                                       |
| ---------------------- | ------------------------------------------ |
| 状态                   | [-] 默认源在线预览本地实现；真实验收待 T31 |
| 优先级                 | P2                                         |
| 阶段                   | C：能力扩展（按范围选择）                  |
| 前置任务               | [T00](T00-protocol-baseline.md)            |
| 证据类型               | 静态差异                                   |
| 建档日期               | 2026-10-08                                 |
| 本期范围 / 负责人 / PR | 按完整目标实施 / Codex / 未创建 PR         |

## 背景与差异

当前预览主要覆盖 image/text/pdf；WebClient 文档能力不能依赖 Desktop bridge 原样迁移，需要确认移动端资源和预览策略。

证据基于总览中记录的本地比较基线。“局部复现”指对现有纯数据处理路径的定向验证；“静态差异”不等于真实后端已支持；“待专项验证”不代表已确认存在缺陷。执行前复查相关代码和协议样本。

## 实施步骤

1. 盘点 DOCX/Office 类型与资源接口，选择服务端转换、WebView 或系统打开策略。
2. 复用 authenticated resource 的 ID/权限/缓存隔离。
3. 处理大文件、未知 MIME、转换失败与离线。
4. 如需依赖只提出 package.json 变更并由用户手动安装，临时文件按会话生命周期清理。

## 当前项目接入点

- [src/features/chatPersistence/authenticatedResourcePreview.ts](../../../../src/features/chatPersistence/authenticatedResourcePreview.ts)
- [src/features/chatPersistence/components/ChatAttachmentStrip.tsx](../../../../src/features/chatPersistence/components/ChatAttachmentStrip.tsx)
- [src/features/chatPersistence/chatAttachmentModels.ts](../../../../src/features/chatPersistence/chatAttachmentModels.ts)

## WebClient 参考入口

- [src/features/viewers](../../../../../agent-webclient/src/features/viewers)

参考实现用于核对数据语义；Native UI、SQLite 持久化和共享连接必须遵守当前项目边界。参考链接要求两个仓库保持当前同级目录关系。

## 验收清单

- [x] DOCX/PPTX/XLSX 在线转换；DOC/PPT/XLS 与未知格式仅下载。
- [x] 未配置、离线、过大、非法/过期链接与转换失败有提示并保留下载。
- [x] App 不缓存预览 URL；默认源绑定配置/凭据，账号/设备身份变化取消等待与迟到结果，实际账号切换仍待真机。
- [x] 不下载 Office 二进制到 App 缓存；关闭/换会话/账号变化取消请求并回收计时器/监听。
- [ ] 真机验证文件交付与打开。
- [x] 实时/回放/冷启动共用原有资源身份与格式分流，无新 timeline 数据或持久化；Native 打开/下载未验收。
- [x] 执行记录与 XGraph 已同步，临时状态清理见总览审计。

## 验证入口

优先扩展或复用以下现有测试；现有测试通过不代表新增协议已被覆盖。针对缺失能力补充能证明行为的测试，避免只复刻实现。

- [chatAttachmentPreview.test.mts](../../../../scripts/tests/chatAttachmentPreview.test.mts)
- [chatAttachmentResourceUrl.test.mts](../../../../scripts/tests/chatAttachmentResourceUrl.test.mts)

执行指定测试使用 `node --no-warnings --test --experimental-transform-types scripts/tests/<文件名>.test.mts`。涉及类型或组件修改时执行 `pnpm typecheck`、`pnpm lint`；真实协议与 Native 交互在联调环境验证，并把命令、结果和样本位置写入下表。纯文档建档不执行业务验收。

## 执行记录

| 记录项                       | 结果                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开始 / 本地完成日期          | 2026-10-08；真实部署与 Native 验收未完成                                                                                                                                                                                                                                                                                                  |
| 实际代码、参考代码与后端版本 | React HEAD `64e015bf28bf12c43f50640257f3ab7d402dbb73` 加既有工作树；WebClient `eeec6f12b29bdf440b47b3d6f108aba67981e2ea`；Backend `b60bbf8a67e02cb569e90e08691b0821537438c6`                                                                                                                                                              |
| 范围决定与协议样本           | 后端 `internal/server/handler_document_preview.go`、`internal/documentpreview/{config,service,types}.go`；GET `/api/document/preview/capabilities`、POST `/api/document/preview` 接受 workspace-file 或 chat-resource 身份，服务端授权/读取/转换；支持 DOCX/PPTX/XLSX，大小以服务端 maxFileBytes 为准（默认 50 MiB）                      |
| 变更文件与设计取舍           | core `documentPreviewProtocol.ts` / `documentPreview.ts`、`AuthenticatedOfficePreview.tsx`、页面级预览 host/source 接线、格式与 Markdown workspace 链接分类、中英文；选择服务端转换加系统浏览器顶层打开，iframe 模式也不嵌 Native iframe，避免依赖 Desktop bridge 或第三方 Cookie；没有 Office 解析引擎、WebView 框架、格式全家桶或新依赖 |
| 来源与鉴权隔离               | 必须为当前默认 sourceId；使用该源已有 apiBaseUrl/accessToken，与主 WS 的配置身份一致，不借当前 Desktop/Identity host 或账号凭据访问另一个源。绝对资源 URL 必须同源，复用已有资源 key/workspace agent；URI 段单次解码，非法/编码穿越与外链拒绝；转换服务每次复查文件授权，配置/凭据变化拒绝迟到结果                                        |
| 性能与生命周期               | 只点击时请求 capability，确认 enabled/格式/大小上限后才 prepare；一次在途、无预取/轮询/自动重试，无 App 预览 URL 或二进制缓存；130 秒整体上限，对应服务端默认 120 秒转换，关闭/换会话/账号设备身份变化/卸载取消本次等待与计时器。取消等待不能保证已经准备的服务端预览被撤销，沿用后端有效期/回收                                          |
| 测试命令与结果               | 专项（含附件接线）10/10；全量 702/702，`pnpm exec tsc --noEmit`、`pnpm lint`、生产 Web 导出通过。新增两份测试覆盖 4 项协议、实际 service 与实际组件行为，不能作为真机证据                                                                                                                                                                 |
| 证据位置                     | `scripts/tests/chatDocumentPreview.test.mts` / `chatDocumentPreviewNative.test.mts`：源/owner、Unicode/百分号、编码穿越、workspace/错 MIME 分类、capability-before-prepare、静态源鉴权、disabled/413/离线、配置变化/取消、有效期/URL、无票据日志、单次点击/顶层打开及切会话/账号设备/关闭迟到回收                                         |
| 真实后端 / Native 联调       | 未执行；实际 Document Hub 配置、可达预览 URL、iOS/Android 浏览器交付/系统下载/离线/大文件待 T00/T31                                                                                                                                                                                                                                       |
| 迁移与回滚方式               | 无 SQLite/schema/数据迁移；移除在线入口/service，原有 image/text/PDF 和系统下载继续使用原链路                                                                                                                                                                                                                                             |
| 阻塞项与后续事项             | 配对 Desktop 的预览 HTTP 路由/认证与资源数据面尚未冻结，明确 unavailable；默认源部署 capability 仍待确认。系统本地文件打开/分享若扩展则依赖 T24 手动安装 expo-sharing；未新增该模块引用                                                                                                                                                   |
| 临时状态清理与原有改动保护   | 最终审计见总览本轮记录；只清理本轮 owned 备份/导出/日志，原有改动按哈希与暂存区保护                                                                                                                                                                                                                                                       |

未知 MIME 按可靠文件名区分 Office，避免误当纯文本读取 ZIP；DOC/PPT/XLS 不冒充可转换。用户显式点击会告知将文件快照交给服务端配置的预览服务。转换响应必须有 previewId/sourceRevision、未来 expiresAt、有效 HTTP(S) URL 和已知 openMode；日志不记录文件快照、源 token 或返回的 bearer 预览票据。
