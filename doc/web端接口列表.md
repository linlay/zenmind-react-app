下面按“配置、HTTP/SSE、WebSocket”整理。除特别说明外，`Response` 列表示统一返回体 `ApiResponse<T> = { status, code, msg, data }` 里的 `data` 结构。

**Base URL / 代理配置**
| 场景 | 前端访问路径 | 上游配置 | 说明 |
|---|---|---|---|
| Webpack 开发代理 | `/api/*` | `BASE_URL` | 普通 HTTP / SSE API，见 [webpack.config.js](/Users/ther/project/git/zenmind/agent-webclient/webpack.config.js:190) |
| Webpack 开发代理 | `/ws` | `WS_BASE_URL \|\| BASE_URL` | 主业务 WebSocket，见 [webpack.config.js](/Users/ther/project/git/zenmind/agent-webclient/webpack.config.js:192) |
| Webpack 开发代理 | `/api/voice/*`、`/api/voice/ws` | `VOICE_BASE_URL` | 语音 HTTP / WS，见 [webpack.config.js](/Users/ther/project/git/zenmind/agent-webclient/webpack.config.js:198) |
| 桌面后端代理 | `/api/*` | `BASE_URL` | 桌面打包运行时反向代理，见 [server.js](/Users/ther/project/git/zenmind/agent-webclient/backend/server.js:355) |
| 桌面后端代理 | `/ws` | `WS_BASE_URL \|\| BASE_URL` | 桌面模式会额外拦截无 token 的 `/ws` 升级，见 [server.js](/Users/ther/project/git/zenmind/agent-webclient/backend/server.js:395) |
| 桌面后端代理 | `/api/voice/*`、`/api/voice/ws` | `VOICE_BASE_URL` | 见 [server.js](/Users/ther/project/git/zenmind/agent-webclient/backend/server.js:356) |
| 容器 Nginx | `/api/ -> ${BASE_URL}/api/` | `BASE_URL` | 见 [nginx.conf](/Users/ther/project/git/zenmind/agent-webclient/nginx.conf:60) |
| 容器 Nginx | `/ws -> ${WS_BASE_URL}/ws` | `WS_BASE_URL` | 见 [nginx.conf](/Users/ther/project/git/zenmind/agent-webclient/nginx.conf:28) |
| 容器 Nginx | `/api/voice/ -> ${VOICE_BASE_URL}/api/voice/`、`/api/voice/ws -> ${VOICE_BASE_URL}` | `VOICE_BASE_URL` | 见 [nginx.conf](/Users/ther/project/git/zenmind/agent-webclient/nginx.conf:11) |
| 默认值 | `.env.example` | `BASE_URL=http://localhost:11949`<br>`WS_BASE_URL=http://localhost:11949`<br>`VOICE_BASE_URL=http://localhost:11953` | 见 [.env.example](/Users/ther/project/git/zenmind/agent-webclient/.env.example:10) |

**Agent / Worker 类接口**
| Method | Path | 功能 | Request | Response |
|---|---|---|---|---|
| GET | `/api/agents?includeChats=` | 拉取 Agent 列表 | `{ includeChats?: number }` | `Agent[]`，前端类型核心字段：`{ key,name,role?,wonders?,controls?,stats?,icon?, ... }`；`includeChats` 时每个 agent 可附带 `chats: Chat[]` |
| GET | `/api/agent?agentKey=` | 拉取单个 Agent 详情 | `{ agentKey }` | `AgentDetailResponse { key,name,icon?,description?,role?,wonders?,model,mode,tools[],skills[],controls[],meta,definition?,soulPrompt?,agentsPrompt?,source? }` |
| POST | `/api/agent/create` / `/api/agent/update` | 创建/更新 Agent | `{ key, definition, soulPrompt?, agentsPrompt? }` | `AgentDetailResponse` |
| POST | `/api/agent/delete` | 删除 Agent | `{ key }` | `{ key, deleted }` |
| GET | `/api/agent/editor-options` | Agent 编辑器下拉项 | 无 | `{ models[], contextTags[], modes[], proxyConfigSchema:{ fields[], defaultTimeoutMs } }` |
| GET | `/api/teams` | 拉取 Team 列表 | 无 | `Team[]`，前端类型核心字段：`{ teamId,name?,role?,agentKey?,agentKeys?,agents?,members?,icon?, ... }` |
| GET | `/api/skills?tag=` | 拉取 Skill 列表 | `{ tag?: string }` | 前端未强类型约束；明确依赖字段：`Array<{ key, label?|name?, ... }>` |
| GET | `/api/tools?tag=&kind=` | 拉取 Tool 列表 | `{ tag?: string, kind?: string }` | 前端未强类型约束；明确依赖字段：`Array<{ key?|name?, label?, ... }>` |
| GET | `/api/tool?toolName=` | 拉取单个 Tool | `{ toolName }` | 前端未强类型约束；按 `Record<string, unknown>` 使用 |

**聊天 / 归档 / 搜索**
| Method | Path | 功能 | Request | Response |
|---|---|---|---|---|
| GET | `/api/chats?agentKey=` | 拉取聊天列表 | `{ agentKey?: string }` | `Chat[] { chatId,chatName?,firstAgentName?,firstAgentKey?,agentKey?,teamId?,updatedAt?,lastRunId?,lastRunContent?,read?,hasPendingAwaiting?, ... }` |
| GET | `/api/chat?chatId=&includeRawMessages=` | 拉取单个会话完整内容 | `{ chatId, includeRawMessages?: boolean }` | 前端实际依赖：`{ events?: AgentEvent[], runs?: [{ runId, feedbackType? }], plan?, artifact?, rawMessages?, firstAgentKey?, agentKey?, activeRun?: { runId } }` |
| POST | `/api/chat/archive` | 批量归档聊天 | `{ chatIds: string[] }` | `{ results: [{ chatId, success, error? }] }` |
| POST | `/api/chat/delete?chatId=` | 删除聊天 | query `{ chatId }`，body `{}` | 前端不依赖固定 `data` 字段 |
| POST | `/api/chat/rename?chatId=` | 重命名聊天 | query `{ chatId }`，body `{ chatName }` | `{ chatId, chatName, updated }` |
| GET | `/api/chat-export?chatId=` | 导出聊天 Markdown | `{ chatId }` | 文件流下载，文件名来自 `Content-Disposition` 或 `${chatId}.md` |
| GET | `/api/archives?agentKey=&limit=&offset=` | 归档列表 | `{ agentKey?, limit?, offset? }` | `{ total, items: [{ chatId,chatName,agentKey?,teamId?,createdAt,updatedAt,archivedAt,lastRunId?,lastRunContent?,snippet?,hasAttachments?,usage? }] }` |
| GET | `/api/archive?chatId=&includeRawMessages=` | 归档详情 | `{ chatId, includeRawMessages?: boolean }` | `{ chatId,chatName?,events?,rawMessages?,runs?,plan?,artifact?,usage?,resourceTicket? }` |
| POST | `/api/archive/search` | 搜索归档 | `{ query, agentKey?, limit? }` | `{ query, count, results:[{ chatId,chatName,agentKey?,teamId?,lastRunId?,lastRunContent?,archivedAt,snippet,score }] }` |
| POST | `/api/archive/delete?chatId=` | 删除归档 | query `{ chatId }`，body `{}` | `{ chatId, deleted }` |
| POST | `/api/search` | 全局搜索聊天内容 | `{ query, agentKey?, teamId?, limit? }` | `{ query, count, results:[{ chatId,chatName,agentKey?,teamId?,runId?,kind,role?,timestamp,snippet,score }] }` |

**调度 / Memory**
| Method | Path | 功能 | Request | Response |
|---|---|---|---|---|
| POST | `/api/schedules` | 调度列表 | `{ tag?: string }` | `{ items: ScheduleSummaryResponse[], total }`，`ScheduleSummaryResponse` 核心字段：`{ id,name,description,cron,agentKey,enabled,teamId?,zoneId?,sourceFile?,remainingRuns?,nextFireTime?,lastExecution? }` |
| POST | `/api/schedule` | 调度详情 | `{ id }` | `ScheduleDetailResponse = ScheduleSummaryResponse + query:{ message, chatId?, role?, params?, hidden? }` |
| POST | `/api/schedule/create` / `/api/schedule/update` | 创建/更新调度 | `create:{ name,description,cron,agentKey,enabled?,teamId?,zoneId?,remainingRuns?,query }`<br>`update:{ id, ...可选字段... }` | `ScheduleDetailResponse` |
| POST | `/api/schedule/delete` | 删除调度 | `{ id }` | `{ id, deleted }` |
| POST | `/api/schedule/toggle` | 启停调度 | `{ id, enabled }` | `ScheduleDetailResponse` |
| POST | `/api/schedule/executions` | 调度执行记录 | `{ id, limit?, offset? }` | `{ items: [{ id,scheduleId,scheduleName,sourceFile,agentKey,teamId,status,error,startedAt,completedAt?,durationMs? }], total }` |
| GET | `/api/memory/record/list?...` | Memory 记录列表 | `{ agentKey?,keyword?,kind?,scopeType?,status?,category?,limit?,cursor?,chatId? }` | `{ count, nextCursor?, results: MemoryRecordListItem[] }` |
| GET | `/api/memory/record/detail?agentKey=&recordId=` | Memory 记录详情 | `{ agentKey?, recordId }` | `{ id, sourceTable, record, rawFields?, embedding:{ hasEmbedding, model? } }` |
| GET | `/api/memory/scope/list?agentKey=` | Memory scope 列表 | `{ agentKey }` | `{ agentKey, scopes:[{ scopeType,scopeKey,label,fileName,recordCount,updatedAt }] }` |
| GET | `/api/memory/meta` | Memory 枚举元信息 | 无 | `{ categories[], types[], scopeTypes[], statuses[], sourceTypes[] }` |
| GET | `/api/memory/scope/detail?agentKey=&scopeType=&scopeKey=` | Scope 详情 | `{ agentKey, scopeType, scopeKey? }` | `{ agentKey,scopeType,scopeKey,label,fileName,markdown,records[],meta:{ editable,recordCount,generatedFromStore } }` |
| POST | `/api/memory/scope/validate` | 校验 markdown scope | `{ agentKey, scopeType, markdown }` | `{ valid, errors?: [{ line,field,message }], warnings?: [...] }` |
| POST | `/api/memory/context-preview` | 预览 Memory 注入上下文 | `{ chatId, message }` | `MemoryContextPreviewResponse { message,agentKey,chatId,teamId?,enabled,summary,prompts,layers,decisions? }` |
| POST | `/api/memory/scope/save` | 保存 scope | `MemoryScopeSavePayload { agentKey,scopeType,scopeKey?,mode,markdown?,records?,archiveMissing? }` | `MemoryScopeSaveResult { saved,agentKey,scopeType,scopeKey,summary,records,markdown }` |

**文件 / 语音 / 运行控制**
| Method | Path | 功能 | Request | Response |
|---|---|---|---|---|
| POST | `/api/upload` | 上传附件 | `multipart/form-data`：`requestId`,`chatId?`,`sha256?`,`file` | 前端实际依赖：`{ requestId, chatId?, upload?: { id,type,name,mimeType,sizeBytes,url,sha256 }, references?: [] }` |
| GET | `/api/resource?file=` | 下载/读取资源文件 | `{ file }` | 原始文本或二进制流；前端通过 `downloadResource/getResourceText` 使用 |
| GET | `/api/viewport?viewportKey=` | 拉取前端工具/内嵌视图 HTML | `{ viewportKey }` | 前端至少依赖 `{ html: string }` |
| POST | `/api/remote-control/sessions` | 创建手机远控会话 | `{ agentKey, chatId, teamId?, title?, ttlSeconds?, startTunnel? }` | `{ sessionId,agentKey,chatId,teamId?,title?,localUrl,publicUrl,qrCodeDataUrl?,accessToken,tunnelStatus,tunnelError?,createdAt,expiresAt,wsPath }` |
| GET | `/api/voice/capabilities` | 语音能力 | 无 | `VoiceCapabilities { websocketPath?, asr?: { configured?, defaults? }, tts?: { modes?,deprecatedModes?,defaultMode?,streamInput?,runnerConfigured?,speechRateDefault?,audioFormat?,voicesEndpoint? } }`；兼容裸 JSON |
| GET | `/api/voice/tts/voices` | 语音音色列表 | 无 | `{ defaultVoice?, voices?: [{ id, displayName, provider, default }] }`；兼容裸 JSON |
| POST | `/api/read` | 标记已读 | `{ chatId?, runId?, agentKey? }` | 前端实际依赖：`{ read?, agentKey?, agentUnreadCount? }` |
| POST | `/api/feedback` | 点踩/清除反馈 | `{ chatId, runId, type, comment? }` | 前端不依赖固定 `data` 字段 |
| POST | `/api/submit` | 工具提交 | `{ runId, toolId, params }` | 前端实际依赖：`{ accepted?, status?, detail? }` |
| POST | `/api/submit` | awaiting 提交 | `{ runId, awaitingId, params: AIAwaitSubmitParamData[] }` | 前端实际依赖：`{ accepted?, status?, detail? }` |
| POST | `/api/interrupt` / `/api/steer` | 中断 / 追问 steer | `QueryLikeParams { requestId,chatId?,runId?,steerId?,agentKey?,teamId?,message,planningMode? }` | `/api/steer` 前端实际依赖：`{ accepted?, status?, detail? }`；`interrupt` 不依赖固定 `data` |
| POST | `/api/remember` / `/api/learn` | 后台 remember / learn | `{ requestId, chatId }` | 前端不依赖固定 `data` 字段 |

**流式 / WebSocket**
| 传输 | 路径或 type | 功能 | 请求结构 | 返回结构 |
|---|---|---|---|---|
| SSE | `POST /api/query` | 文本流式问答 | `QueryStreamParams { requestId,message,planningMode?,agentKey?,teamId?,chatId?,role?,references?,params?,scene?,stream? }` | `text/event-stream`；每个 `data:` 为 `AgentEvent` |
| 主业务 WS | `GET /ws?token=` | 统一实时/请求通道 | 连接后发送 `{"frame":"request","type":"/api/xxx","id","payload"}` | `response/stream/push/error` 四类 frame，见 [wsClient.ts](/Users/ther/project/git/zenmind/agent-webclient/src/features/transport/lib/wsClient.ts:14) |
| 主业务 WS | `type="/api/query"` | 通过 WS 发起问答流 | payload 基本同 `QueryStreamParams` | `frame:"stream"`，`event` 为 `AgentEvent` |
| 主业务 WS | `type="/api/attach"` | 重新附着到运行中的 run | `{ runId, lastSeq }` | 持续 `stream` 事件，直到结束 |
| 语音 WS | `/api/voice/ws?access_token=` | ASR / TTS 通道 | 发送：`asr.start`、`asr.audio.append`、`asr.audio.commit`、`asr.stop`、`tts.start`、`tts.append`、`tts.commit`、`tts.stop` | 接收文本帧：`connection.ready`、`task.started`、`tts.audio.format`、`tts.audio.chunk`、`tts.done`、`task.stopped`、`error`；二进制帧为音频 PCM |

源码主入口在 [apiClient.ts](/Users/ther/project/git/zenmind/agent-webclient/src/shared/api/apiClient.ts:47)、[apiClientProxy.ts](/Users/ther/project/git/zenmind/agent-webclient/src/features/transport/lib/apiClientProxy.ts:151)、[wsClient.ts](/Users/ther/project/git/zenmind/agent-webclient/src/features/transport/lib/wsClient.ts:14)、[voiceSocket.ts](/Users/ther/project/git/zenmind/agent-webclient/src/features/voice/lib/voiceSocket.ts:28)。如果你要，我可以继续把这份表再拆成“可直接给后端对接”的接口文档格式。
