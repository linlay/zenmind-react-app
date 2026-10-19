# 移动端邮箱登录与 Desktop Identity 票据同步改造方案

[返回任务总览](README.md)

状态：**阻塞（等待用户真实环境验收）**。本地实现和验证见 [实施记录](IMPLEMENTATION.md)，真实环境尚未验收，缓存清理例外已按用户决定记录并保留。目标是复用现有认证与连接能力，替换原扫码票据交付，不建设新的统一认证平台。

## 一 实施前基线与纠偏

实施前的 Desktop 扫码内容由 `zenmind-desktop/src/main/modules/identity/app-pairing.ts` 生成：通过 `issueAccessToken` 获取本地 Identity App Token，带上电脑 WS 地址、本地设备 ID、票据和到期时间。该票据用于连接对应 Platform，不是官网个人身份。

被替代的实现引入 Identity 手机账号、邮箱绑定与会话，以及 Hub 的 `tr_` 随机路由票据；远端 Desktop 强制校验 `tr_` 后再取本地业务 Token。它改变了原业务票据交付模型，应收回。保留现有 Hub 电脑目录、在线状态、改名/撤销、默认云端独立认证和移动端缓存隔离。

注意：当前 `tunnel.open.payload.identityToken` 是官网 canonical SSO Token。不能把它当成本地 Identity App Token，也不能直接把它换成本地票据，破坏 Hub 的注册归属校验。

## 二 最小目标链路

```text
Desktop 现有官网登录 → 官网可信用户身份 → Hub 电脑登记/出站 Tunnel
Desktop 本地 Identity → Platform App Token → 同步到 Hub 当前连接内存

手机原生邮箱表单 → 官网邮箱接口 → 用户信息与官网认证结果
手机官网认证结果 → Hub 按配置字段匹配电脑 → 获取所选电脑的 Platform 票据
手机携带 Platform 票据 → Hub 校验用户归属并转发 → Desktop/Platform 既有票据验证
```

| 结果               | 权威来源                      | 用途与存放                                 |
| ------------------ | ----------------------------- | ------------------------------------------ |
| 官网用户资料       | 官网/品牌现有认证服务         | 展示用户；不作为客户端自报授权依据         |
| 官网认证凭据       | 同一服务的已有 Cookie/SSO JWT | 用户识别与 Hub 设备授权；不代替业务票据    |
| Identity App Token | 所选 Desktop 的本地 Identity  | 业务连接；Hub 和移动端仅存内存，按电脑隔离 |
| 电脑目录与在线状态 | Hub DB 与现有 Manager         | 注册信息可持久化；在线状态由真实连接决定   |

Hub 不导入本地私钥、不签发票据、不增加票据表、Redis、队列、专门凭据服务或用户同步库。Agent Platform 默认保持现有协议。

## 三 官网邮箱与会话接入

直接复用 `POST /api/auth/email-code/start` 的 `{email}`、`{ok, expiresAt}`；复用 `POST /api/auth/email-code/verify` 的 `{email, code}`、`{user}` 与 Set-Cookie。官网负责验证码、邮件、限流、注册/用户关联及账号启停，手机不复制这些逻辑。

现有验证码验证返回 Cookie，不返回 Identity 的 `challengeId/deviceToken/AccountSession`；App 必须改响应适配，不能只改 base URL。

默认先复用原生请求 Cookie 容器、`GET /api/auth/me`、`GET /api/auth/csrf`、现有 SSO JWT 换取和 logout。官网 JWT 仅发送至配置且验证过的官网/Hub 端点；不把账号 Cookie 发给 Hub，不把 Identity 票据发给官网。恢复以真实有效会话为准，Cookie 到期则重新邮箱登录，不预设更长免登录期限。

T00/T01 必须验证 iOS/Android 重启后的 Cookie 行为。若既有请求层不能满足已确认的恢复要求，只做一处原生会话承接适配并在实施前记录接口差异；不得直接升级为 OAuth、长期 Refresh Token 系统或第二套账号库。

CuteJ 沿其现有品牌认证入口和字段配置适配；未核实其真实接口前，不假定它与 ZenMind 官网路径一致，不为其另造 IdP。使用既有品牌环境制品；只有缺失的官网认证地址加入该制品，不修改完整环境构建体系。

## 四 用户 ID 与设备标识

- Hub 从已验证的官网 JWT 按 `SSO_JWT_USER_ID_CLAIM` 读取唯一用户 ID；缺失直接拒绝，不回退邮箱、username、account_id 或客户端提交的 ID。
- Desktop 登记、手机查询/改名/撤销、取票、WS 与 HTTP 数据面使用同一个解析函数。已有 ownerUserId 表示保持兼容，不随意把 `user:42` 改成 `42`。
- 该变量配置的是字段名，不是品牌隔离或签名信任。默认沿既有单品牌/环境 Hub 部署分别配置；若实际共用多 issuer，T00 记录为部署前置，不顺手建设多租户身份路由。
- Hub 注册 ID 表示电脑记录；本地 Identity 设备 ID 表示票据的目标设备，二者不互相替换。
- 不再以 Identity 手机会话 UUID 决定电脑归属，也不再请求 Identity `/api/auth/me` 验证官网身份。

## 五 Desktop 上报与 Hub 内存

初次登录和每次重连，在现有 `tunnel.open` 增加具名 `platformCredential`，包含 `token、platformDeviceId、expiresAt`；保留原 `identityToken` 字段的官网认证语义。成功响应已有 `sessionId` 用于后续更新。

在线更新复用 `POST /api/desktop/devices/register`，增加可选的 `platformCredential` 和当前 `tunnelSessionId`；没有这些字段时仅执行原电脑登记。有票据更新时，先验证官网身份、当前注册归属和 Manager 当前连接 sessionId，再更新内存；失败不得部分写入。更新不创建新设备、不恢复已撤销设备、不重启 Tunnel。

复用 Manager 当前 Desktop 连接保存凭据，按 deviceKey 定位，ownerUserId、Hub 设备 ID、Platform 设备 ID、Token、有效期和 sessionId 共同绑定。不要维护另一份在线设备目录。Hub 验证上报来源和票据字段/有效期；票据密码学有效性由本地 Desktop/Platform 校验，Hub 不以仅解码 JWT 冒充验签。

Desktop 复用既有 `issueAccessToken` 缓存与刷新，登录后上报有效票据，当前连接存活时到期前更新。单次更新失败保留尚有效旧票据，原有有界重试即可；过期后取票失败，不能无限重试或默认为已同步。旧登录/连接代次的迟到结果不能覆盖新账号。

退出、切号、撤销、断连清除对应内存。Manager 原有 sessionId 比较保护新连接：旧连接结束不能清掉新连接票据。Hub 重启丢失票据后由 Desktop 重连补齐，不能从 DB 或手机反向恢复。

## 六 手机取票与业务操作

保留 `/api/desktop/account-devices` 与 PATCH/DELETE 电脑接口。将现有 `POST /api/desktop/route-credentials` 原位改成“取得选中电脑已有 Platform 票据”：请求只需 `targetDesktopId`；返回 `schemaVersion、credential、expiresAt、platformDeviceId、webSocketUrl、tokenMode`。`credential` 是 Desktop 上传的原 Identity Token，不再生成 `tr_`、routeContext、手机 session UUID 或 JTI 消费状态。

取票必须检查当前官网用户、DB 当前归属、设备未撤销、在线连接和有效票据。目录不附带所有票据。目录失败不等于空目录；票据不可用不等于电脑离线，App 不能据此清缓存或自动切云端。

WS 和 HTTP 数据面的官网授权与业务票据分开：管理/取票 API 继续以 Authorization 携带官网 JWT；业务请求沿用已有 bearer subprotocol/Authorization 携带 Identity 票据，并以具名 `X-Account-Authorization: Bearer <官网JWT>` 提供归属证明。Native WS 在已有工厂增加最小 headers 参数，不新建 Socket。两种凭据不放 URL、不跟随重定向。

Hub 在 WS upgrade、上传、资源和移动 WebApp 入口按 Host/注册记录确定目标，再核对官网用户；不能接受 body/publicHost 覆盖。WS 建连后的帧不重复塞 Token；长连接依赖当前电脑归属与 Tunnel 存活，撤销或 Desktop 切号关闭对应连接。

WebApp 复用现有网关 Cookie 会话能力：受控入口校验两种凭据后，同 Host 后续请求通过 Secure/HttpOnly Cookie 承接同一授权结果，不把票据或官网 JWT 暴露给网页 JS。T00 核实现有 Cookie 的真实行为；如需扩展，只扩展该网关，不新增通用 session 平台。Web 构建缺少可验证授权传输时明确失败，不使用 query Token 兜底或放宽校验。

Desktop 远端入口改回验证传入 Identity Token 的签名、scope、设备和有效期；此改动与 Hub 归属检查同批切换，不能先放开 Desktop 而保留无授权公网转发。手机票据到期时向 Hub 取更新后的票据并沿现有 auth.refresh 更新连接；不让 Desktop 绕过 Hub 给手机回发另一套长期凭据。

## 七 状态与数据边界

票据不进入 MMKV、SQLite、环境制品、日志或文档。重启/切源重新从 Hub 取票；同用户两台电脑各取自己的票据。同一有效票据可复用原业务协议，不再要求每个 Socket 生成 Hub JTI。

账号会话和电脑票据分开；用户资料/账号状态由 accountAuth 管理，票据由既有 transport provider 在内存按来源保存。切账号、切电脑、退出清理旧来源票据和连接；异步结果继续使用既有 generation，不增加全局认证 Provider。

缓存按账号和来源隔离，切源使迟到回调失效；不自动重发 query，不迁移或认领旧聊天数据；认证、来源配置、远端数据和用户原始文件保留。

## 八 清理与验收

T06 删除被替代的 Identity 公网手机账号、邮箱绑定解绑、tr\_ 校验与对应调用/配置/测试；原管理台、CLI、本地 App Token 和 OIDC 留在原职责内。原扫码函数只是契约参照，不恢复扫码 UI；确认没有其他消费者后删除无用代码，不能删除不明来源状态。

必须用真实服务证明：原生邮箱获取官网身份；用户 ID 配置实际生效；同用户两台电脑对应不同本地票据；跨用户不可列表/取票/连接/请求；真实 Identity Token 能驱动原 Platform 协议；更新、重启、退出、切号和撤销不串源。

发布将 Hub 归属校验、Desktop 票据上传与远端接收、App 取票协议作为一个配套版本；现网消费者在 T00 核实后按 T07 切换。默认不做旧 tr\_ 与新票据永久双轨。回退使用记录的整套原版本，暂停移动远端入口，不回退成无授权公网连接，不删除账号/电脑/聊天数据。
