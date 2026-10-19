# T05 同用户电脑选择与 Identity 业务票据接入

[返回总览](../README.md) · [改造方案](../DESIGN.md)

状态：**阻塞**。前置：[T02](T02-hub-owner-credential.md)、[T03](T03-desktop-credential-sync.md)、[T04](T04-mobile-email-login.md)。交付：T06、T07。

## 目标

复用电脑目录与唯一来源选择，用 Hub 返回的 Desktop 原 Identity Token 建立现有业务连接。全部数据面保持同一目标、同一凭据来源。

## 工作

1. deviceLinkApi 以官网凭据调用 Hub 目录/管理/取票；目录只含电脑信息，选中在线电脑后获取其 Identity credential 和 Platform 设备 ID。
2. 替换 tr\_ 正则、routeContext/JTI/手机session UUID解析；保留必要的版本、连接地址、设备和到期校验，响应必须来自受信 Hub。
3. 在 activeWsTransport 现有内存缓存和 provider 保存所选电脑票据，按官网用户、Hub 电脑、本地设备和来源generation绑定。到期/业务401重取一次，403不循环重试，不建 Token store。
4. WS 使用既有 Identity bearer subprotocol；官网 JWT 通过 X-Account-Authorization 独立提供。原 Native WebSocket 工厂只增加必需headers参数，复用 sharedWsTransport，不能在页面建连接。
5. 上传、资源、下载、导出及移动 WebApp 使用同样的票据provider和官网证明，限制到当前电脑可信Host。WebApp的受控入口/后续Cookie按Hub契约衔接，真实验证子资源和WS，不能只给首个页面加header就宣称全部完成。
6. auth.expiring 从 Hub 获取 Desktop 更新后的票据，沿既有 auth.refresh 更新；401只重试一次。不要每次Socket签发新Hub票据，也不要让Desktop绕过Hub另发手机长期凭据。
7. 换用户、换电脑、退出清内存票据与来源连接，旧请求使用generation拒绝。离线可沿现有缓存模式读取；缺票/网络故障不自动清缓存、选云端或判定撤销。
8. 缓存按账号和来源隔离，切源使迟到回调失效；不自动重发 query，不迁移或认领旧聊天数据；认证、来源配置、远端数据和用户原始文件保留。
9. 原默认云端凭据和数据面独立，不带官网Token或电脑Identity票据。手机退出不退出PC、不取消远端任务。

## 验收

- [ ] 同用户两台PC切换时正确票据、设备、连接与缓存成套切换。
- [ ] 跨用户不能取票，也不能靠记住Host/旧票据访问WS与HTTP/WebApp。
- [ ] 真实Identity票据可驱动原Platform业务，持续连接跨票据更新通过。
- [ ] 重启、迟到响应、离线/缺票/撤销、401/403边界通过；凭据不入库或日志。
- [ ] Chat/WebApps共享WS、全部现有HTTP数据面及独立云端回归通过。

## 执行记录

2026-10-15：现有 provider 缓存原业务票据，独立官网 header，物理连接/重连及 auth.refresh 复用 shared transport；上传/资源受控双 header，401 单次重取、403 不循环。WebApp 受控 Cookie bootstrap+干净 URL，资源流式写入和 scope 防串源；旧数据不清空。真实 PC、Native 子资源/WS 与持续业务由用户验收，见 [实施记录](../IMPLEMENTATION.md)。


2026-10-15 状态复核：本地实现/检查记录保留，真实环境验收尚未提供，当前等待用户验收证据；不以重复本地测试代替真实结果。
