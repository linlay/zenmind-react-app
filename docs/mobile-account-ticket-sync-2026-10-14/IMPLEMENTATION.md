# 本地实施与验收记录

更新：2026-10-15。**本地代码已落地，整体阻塞，未完成。** 用户明确“真实环境我来验收”；下面的单元/集成测试与导出构建不代表真实邮件、线上消费者、双品牌或真机验收已经通过。本轮未部署、推送或提交。

## 版本基线与范围

所有修改仍在对应工作区，以未提交 diff 审阅：

| 仓库 | 开工 HEAD | 本轮行为 |
| --- | --- | --- |
| App | `8ff9557bbae11c65ac50bc8b5c1cb4e7f82eef33` | 官网原生邮箱、独立证明与原业务票据接入、资源/WebApp 数据面、旧入口清理 |
| Desktop | `f8e8f4571b355a5665c0658896879f7e168ebde5` | 初次/重连上传与在线更新、原 Identity 验证、配对码链路删除 |
| Hub | `74451cee3ec14d080a1a65e393818e7b869514c6` | 配置字段权威用户、所属电脑内存票据、全部移动数据面授权 |
| Identity | `87adc83781fbf759a3ea9976618b490eb979168d` | 撤除公网手机认证/SMTP；保留本地 App Token、管理、CLI/OIDC 与历史数据 |
| 官网服务 | `9f0a9c060466831ab0bee9c89fe068ffb1cc49be` | 只读契约，未改代码 |
| 官网网站 | `24b87dccdc140803be5acb73d5d245d980d9d09a` | 只读参考，未改代码，不是发布依赖 |
| react-app-env | 开工无提交 | 可选 accountServices 契约、校验、consumer 兼容测试 |

App 与 react-app-env 的原有修改/未跟踪文件属于用户预先状态。无关内容、package/lock 和真实 `.env` 不作为清理对象。未安装依赖、未修改 Git 分支/remote/refspec、代理、凭据或 hook。

## 当前契约

- 原生邮箱：官网 POST `/api/auth/email-code/start` `{email}`，verify `{email,code}`；以 Cookie 调用 me 确认真实用户，再以 csrf 交换 desktop-sso/token。错误按官网 code/message 解析。验证码不落盘，官网证明只留内存；手机退出的本地标记阻止失败的远端 logout 在重启时复活会话。
- 环境：`brand.accountServices` 可选，但启用时 officialApiBaseUrl 与 tunnelHubApiBaseUrl 必须同时配置。缺失时关闭账号服务入口，不回落 Identity 或默认云端。生产/staging 只接受公网 HTTPS；不填写猜测的 CuteJ 地址或用户字段。
- 用户：Hub 只按 `SSO_JWT_USER_ID_CLAIM` 取稳定 ID；`account_id` 不再覆盖配置值。官网证明负责账号/归属，业务票据负责对应本地 Platform 身份。
- Desktop：复用 issueAccessToken 与原签名验证，tunnel.open 上送 `{token,platformDeviceId,expiresAt}`。握手 sessionId 绑定在线更新；POST register 更新当前连接，单计时器在到期前刷新，失败最多额外重试 3 次，不重启健康 Tunnel。stop/退出/新 generation 丢弃迟到结果。
- 取票：POST `/api/desktop/route-credentials` 只传 targetDesktopId，返回该在线电脑原 credential、platformDeviceId、expiresAt、webSocketUrl、tokenMode=subprotocol、schemaVersion=1。目录不返回票据。离线 409、缺票/到期 503、其他用户拒绝。
- 数据面：WS 用业务 bearer subprotocol，Native 独立 `X-Account-Authorization`；上传和 `/api/resource` 用两类独立 header。Hub 在转发与缓冲上传前检查官网用户及目标，官网证明不进入 Platform。401 重取一次，403 不循环，携带认证请求禁止重定向。
- WebApp：受控 POST `/api/mobile-session` 建立不透明、host-only、HttpOnly、Secure、SameSite Strict Cookie，期限不超过两类凭据。页面及其子资源/WS 使用 Cookie，网关内部透传原业务票据。WebView 仅收到干净 URL，不使用 Token query/header；现有 resident 生命周期内更新，关闭最后使用者或切号撤销。Cookie 不跨 Tunnel 重连继续有效。真实 Native Cookie/WebView 共享仍需用户验收。
- 资源：Native 图片/下载按块写文件，按来源及认证 generation 拒绝迟到结果，文本按字节上限增量读取；下载失败仅删除本次创建的文件，不覆盖同名已有文件。尚无 Desktop HTTP 契约的 export/Office/workspace 能力继续明确失败，不伪造端点。
- 缓存：官网账号使用 `official:<origin>:<userId>` scope，与旧 Identity 数据分开；不合并旧数据、不批量删除、不重放旧 outbox。默认云端凭据、scope 与退出保持独立。

## 删除与保留

删除：Hub 随机 tr_ 签发/验证及 Identity me 依赖；Desktop tr_/JTI/轮询验证，旧配对码生成的模块、IPC、preload、契约、设置 UI/样式/文案与专用测试；App Identity 密码/挑战/绑定解绑/账号安全入口与未使用幂等工具；Identity 公网账号/邮箱 handler、store、SMTP 配置、管理解绑入口及被替代测试。

保留：原本地 Identity App Token/密钥、管理员密码、CLI、OAuth/OIDC，独立云端登录，普通 Agent/已发布 WebApp 和历史分享。schema 停止初始化旧邮箱功能表，**没有 DROP 或清空历史数据库**；旧手机设备不混入本地设备，也不由本地清理任务删除。旧方案文档加停用提示，保留历史内容。

## 自动验证证据

2026-10-15 本地结果；命令直接使用已安装工具，没有安装依赖：

| 验证 | 结果与边界 |
| --- | --- |
| App `node --no-warnings --test --experimental-transform-types scripts/tests/*.test.mts` | 742 通过，0 失败。包括 Cookie 生命周期、迟到撤销、资源流式上限、401/403、已有文件保护、账号与来源隔离；Native 边界使用受控 mock，不是实机证据 |
| App `tsc --noEmit`、`eslint . --ext .ts,.tsx` | 通过，无输出错误 |
| App Expo Web/iOS/Android export | 三平台 bundle 导出通过；输出隔离到临时目录，不是实机证据 |
| Desktop Main 与 renderer `tsc --incremental false` | 通过 |
| Desktop architecture checker | 通过，698 源文件、22 模块 |
| Desktop 原票据签名/设备/scope/到期/auth.refresh 与 URL helper | 4 通过；最终两品牌分别运行完整协议/Tunnel 子集，各 50 通过、0 失败 |
| Desktop Tunnel runtime | 20 通过，含在线更新不重启、有界重试和退出竞态 |
| Desktop WS/Tunnel/设置相关回归 | 第一轮 55 项中 54 通过；1 项原有 IM 默认地址断言失败，当前 HEAD 的实现默认空值而该测试预期 localhost；本次未改该 IM 文件。新增 runtime 用例另行全部通过 |
| Desktop 原 Identity/SSO/OIDC/本地主体回归 | 107 项全部通过，0 失败 |
| Desktop renderer Vite build | ZenMind/CuteJ 均通过；原配置与资源复制目标隔离在临时目录，不触碰已有品牌产物 |
| Hub `TEST_DATABASE_TYPE=sqlite go test ./...` | 相关 auth/desktop/proxy/store 等通过；全量失败在未改动 shareassets 的内容 hash。804 个分享资源文件与开工哈希一致，不能记作全量通过 |
| Hub `TEST_DATABASE_TYPE=sqlite go test -race ./internal/proxy ./internal/desktop ./internal/auth` | 通过；已修复心跳复制可变 ActiveTunnel 导致的竞争 |
| Hub `make verify-neutral` | 未通过：环境未配置禁用词；以任务涉及品牌名作为进程级输入重试时，命中已有分享资源，HEAD 同样失败。不削弱检查，不删除历史分享资源 |
| Hub MySQL 定向测试 | 未通过：缺少专用测试服务器的 TEST_MYSQL_HOST，未连接应用/生产数据库；需用户环境复验 |
| Identity backend `go test ./...` | 全部通过，包括本地 App Token、CLI、OAuth/OIDC 和历史数据保护 |
| Identity frontend | 前轮 Vite 构建通过，管理邮箱解绑入口已删除 |
| react-app-env tests/lint/validate | 11 项测试通过；lint 通过；实际两环境、两品牌配置校验通过，不打印凭据 |
| react-app-env build/manifest/App consumer | example 产物与 manifest 校验通过；缺省与带 accountServices 的受控测试产物均兼容两品牌 consumer |

这些结果仅说明当前本地代码行为。未声称真实官网与真实 Identity 使用相同测试密钥或模拟账号互通。

## 用户真实验收与发布

仍需用户确认：ZenMind/CuteJ 的真实官网接口与配置 claim、当前电脑 owner ID 是否一致、旧 Identity 手机/tr_ 客户端消费者是否已切换、Hub 单实例条件，以及真实 iOS/Android、macOS/Windows 两台 PC 的完整验收矩阵。真实邮件/首次注册/错误码/Cookie 重启和到期、持续 Platform 业务跨票据更新、WebApp 子资源与 WS、上传下载及退出撤销均须真实通过。

发布前记录四个实际发布制品的不可变版本和旧版本。存在旧线上消费者时先暂停移动远端入口，配套更新 Hub/ Desktop，再发布 App；消费者切换完成后才能撤除线上 Identity 公网接口。没有已确认消费者清单时不发布。

失败时暂停新移动入口并回退记录的配套 App/Desktop/Hub/Identity 版本；官网网站无发布依赖。保留所有历史账号、电脑、聊天、分享和审计数据，不为回退删除数据库。Hub 重启只丢内存票据，由 Desktop 重连恢复，不降级到匿名。

## 清理审计

2026-10-15 收口审计：各仓库 HEAD/分支与开工记录一致；react-app-env 仍无提交。官网服务和网站所有已记录文件字节均未变。App 的 package.json、pnpm-lock.yaml、app.config.js、原有调试/数据库改动和无关历史文档与开工字节一致；其余差异逐项对应本次实现、被替代代码清理或 XGraph 派生更新。

Expo 导出只改动原有 `.expo/dev/logs/export.log`，已恢复其原字节和文件元信息；`.generated`、`src/shared/generated` 与导出前完全一致，没有新增 `.cache` 或 node_modules/.cache。只读进程审计没有发现使用本任务临时目录的剩余进程。没有持久 Git/网络/代理/凭据配置改动。XGraph index/status/sync 已运行通过。

**清理例外，仍未完成精确还原：** 早期一次 Desktop 类型检查可能更新了预先存在的 `.cache/typescript/main.tsbuildinfo`（文件创建于 2026-09-28，现修改时间 2026-10-14 16:50:06，262607 字节）；未保存该缓存的开工原始字节，不能声称已恢复。后续检查均用 `--incremental false`，该文件保持原位，没有擅自删除。它是可重建的 TypeScript 缓存，不是业务代码或运行配置。

2026-10-15 用户明确选择“保留缓存并记录例外”：该文件按用户决定保留，不再作为待删除的临时产物；原始字节未知仍是审计事实，不能声称已经恢复。未运行缓存删除或重建，也未把用户决定解释成原字节恢复成功。

本任务临时备份、日志、构建产物和隔离测试缓存已删除，记录的临时目录已不存在；交付仅保留源代码、测试、配置样例、文档与用户明确保留的既有缓存。

同日用户明确回复真实环境“尚未验收”。因此 T00–T07 及整体转为阻塞：缺少真实服务、双品牌/双平台、旧消费者处理和发布证据，MySQL 测试条件及已有分享资源门禁也未关闭。不把本地测试替代用户验收。
