# T00 核实官网身份与原 Identity 票据契约

[返回总览](../README.md) · [改造方案](../DESIGN.md)

状态：**阻塞**。前置：无。交付：T01、T02、T03、T04。

## 目标

核实已存在的能力和真实部署条件，冻结最小接入契约。只做事实核实，不建设新认证系统。

## 先读

- 各目标仓库 AGENTS.md；App 的 XGraph auth、API、WebApps module 和相关 task。
- 官网 `internal/auth/server.go`、`request_security.go`、`desktop_jwt.go`。
- Hub `.env.example`、`internal/auth/sso_jwt.go`、`internal/proxy/manager.go` 和公网入口。
- Desktop `app-pairing.ts`、`agent-auth.ts`、Tunnel runtime、WS authentication。

## 工作

1. 记录六项目版本、分支、用户改动和旧客户端消费者；不切分支、拉代码、改配置或重置工作区。
2. 分别核实 ZenMind/CuteJ 的已有官网认证地址、JWT issuer/audience、配置字段名及 Hub ownerUserId 表示。记录脱敏示例，不输出真实 Token、邮箱或密钥。不能因 CuteJ 接口未定位而假定与 ZenMind 相同。
3. 在可用测试环境核实邮箱 start/verify、me、csrf、JWT 与 logout。核实原生请求 Cookie、App 重启和到期行为；已有有效 Cookie 满足会话期限时直接复用，到期重新登录。
4. 核实原 Identity Token 的签发者、scope、目标设备、期限及 Desktop/Platform 的真实校验；区分 Hub 注册 ID 与本地设备 ID。
5. 核实 WS、上传、资源、移动 WebApp 当前 Token 传输和网关 Cookie 行为，确认两类凭据可以独立携带；不以浏览器 Cookie 或纯 mock 替代 Native 证据。
6. 记录 Hub 是否单实例、品牌是否独立部署、旧 tr\_ 和 Identity 公网账号是否有现网消费者。单实例内存设计为默认；不自动扩展 Redis、多 issuer 或多租户。
7. 将实际结果追加到本任务执行记录；接口差异只修正方案中受影响段落。若无法访问真实配置/测试设备，标具体缺口并阻塞依赖项，不发明接口或默认为已验证。

## 禁止扩大

不改 official-website，不新建邮箱/SMTP 功能，不上 OAuth/PKCE/Refresh Token 平台；不为计划核实恢复扫码入口。架构方向已确认，核实只补事实。

## 验收

- [ ] 两品牌可信用户 ID 取值及已有电脑所有者表示已核实。
- [ ] 原生 Cookie 会话可用性、期限和退出有明确证据或精确阻塞项。
- [ ] 真实 Identity 票据与所有数据面传输契约明确。
- [ ] 内存部署与现网消费者明确，后续任务没有隐式兼容假设。
- [ ] 所有临时测试会话、文件和配置已按原状态清理；用户改动保留。

## 执行记录

版本、源码契约与本地证据见下方记录及 [实施记录](../IMPLEMENTATION.md)。Native/真实服务、双品牌真实配置、现网消费者和部署由用户验收，尚无完成证据。最终清理审计见实施记录。

### 已核实的本地契约与执行授权

- 用户授权继续本地实施，真实环境由用户验收。未启动或修改真实服务、设备、代理、密钥和部署配置。
- 官网已有 `/api/auth/email-code/start`、`verify`、`me`、`csrf`、`desktop-sso/token`、`logout`；verify 返回 `{user}` 并写 Cookie；token 使用 Cookie + CSRF 返回官网 JWT；logout 需要 CSRF。JWT `sub=user:<id>`、`user_id=<id>`，Hub owner 表示取决于配置字段，不统一改写。
- 本地 Hub 的用户字段为 `sub`；当前本地 issuer 指向 loopback Identity，不代表两品牌真实部署契约。真实 issuer/audience/公钥匹配仍由用户确认，不修改 `.env`。
- Desktop 原 `issueAccessToken` 按本地应用缓存；原票据 `scope=app`、`device_id` 为本机 Identity 设备、`exp` 为有效期；签名由原 Desktop JWK/Platform 校验。Hub 注册设备 ID 独立。
- App 目前请求 Identity challenge/deviceToken；Hub 保留 `tr_` 与 Identity `/me`；Desktop 强制远端路由凭据。需成套替换。
- Desktop 扫码仍有 SettingsPage → preload → settings IPC → app-pairing 调用，不能仅凭函数名认定无消费者。手机扫描 UI 已被用户此前改动移除；旧线上消费者未确认。
- 现有移动 WebApp Cookie 由 query token 建立，只有业务票据、没有官网归属证明。需扩展既有网关：受控 headers 入口建立同 Host 的 HttpOnly 会话，并绑定当前 Tunnel。App Web 构建不能以 query Token 降级。
- App 品牌环境产物当前只有 defaultSource；未发现可验证的 CuteJ 邮箱协议。新增账号服务地址时默认缺省关闭，不把 Identity/defaultSource 地址作为官网回退。
- Android inventory 与 iOS simulator 在当前权限下不可用；未声称设备不存在。未进行真实邮件发送、登录或原生 Cookie 验收。

开工版本：App `8ff9557bbae11c65ac50bc8b5c1cb4e7f82eef33`（97 条预先状态项）；Desktop `f8e8f4571b355a5665c0658896879f7e168ebde5`；Hub `74451cee3ec14d080a1a65e393818e7b869514c6`；Identity `87adc83781fbf759a3ea9976618b490eb979168d`；官网 server `9f0a9c060466831ab0bee9c89fe068ffb1cc49be`；官网 website `24b87dccdc140803be5acb73d5d245d980d9d09a`。后三类服务与 Desktop/Hub 开工时均干净；未切分支、拉取、重置或安装依赖。


### 2026-10-15 进展

已核实官网源码、原本地票据与配置字段；真实环境及消费者清单由用户验收。未猜测 CuteJ 契约，缺失配置关闭账号入口。基线版本、Native Cookie 边界和剩余项见 [实施记录](../IMPLEMENTATION.md)。


2026-10-15 状态复核：本地实现/检查记录保留，真实环境验收尚未提供，当前等待用户验收证据；不以重复本地测试代替真实结果。
