# T03 Desktop 登录重连与 Identity 票据更新同步

[返回总览](../README.md) · [改造方案](../DESIGN.md)

状态：**阻塞**。前置：[T00](T00-contract-baseline.md)、[T02](T02-hub-owner-credential.md)。交付：T05。

## 目标

用 Desktop 向 Hub 同步替代扫码向手机传票据。复用现有 issueAccessToken 和 Tunnel 生命周期，本地 Platform 主体不受官网账号改变。

## 先读

Desktop `docs/鉴权SSO与TokenBridge.md`、`app-pairing.ts`、`agent-auth.ts`、Tunnel registration/runtime/client-endpoint 和 WS authentication。按该仓库 AGENTS.md 阅读关联设计。

## 工作

1. 从既有 issueAccessToken 取得有效本地 App Token；提取本地设备 ID 和到期时间，不新建签发、缓存或读取服务私钥的逻辑。
2. 登录完成且启用 Tunnel 时，在现有 tunnel.open 同步 platformCredential；原 identityToken 继续表示官网 SSO。未启用 Tunnel 不额外建立上报连接。
3. 保留 handshake 返回的 sessionId；当前连接内票据到期前，复用现有刷新缓存和 register API 更新平台票据。更新带当前 sessionId，不重注册新电脑、不为更新重启健康 Tunnel。
4. 网络失败沿已有有界重试；有效旧票据在其期限内可用，到期后清楚报告不可用。只维护一份刷新任务/计时器，stop 时清理，避免新建调度中心。
5. 登录、账号、连接、目标 relay 变化时检查现有 generation；迟到签发/上报不得写入新登录或旧连接。
6. 重连重新上传，Hub 重启由原重连链路恢复；退出/切号/撤销清理同步状态，远端失败仍完成本地退出，不停本地任务或更换 Platform 主体。
7. 配合 T02 将远端 WS/WebApp 接收改成验证原 Identity Token；Hub 授权到位后再切换，移除强制 tr\_ 校验，不保留未经授权的公网兼容入口。

## 验收

- [ ] 登录、重连、在线更新和退出均同步正确；原官网 SSO 不受影响。
- [ ] 本地设备与 Hub 注册 ID 不混用，票据与原扫码业务语义相同。
- [ ] 超时、失败、旧连接/登录迟到结果不串号，计时器和任务清理完整。
- [ ] 同步更新不重启健康 Tunnel，长任务/流式会话持续可用。
- [ ] macOS/Windows 相关分支及原本地服务认证回归通过。
- [ ] 票据只在既有本地凭据边界及传输中使用，不写普通配置/日志。

## 执行记录

2026-10-15：复用 issueAccessToken、原签名验证和 Tunnel.open/register；当前 session 单计时器更新及有界重试，stop/generation 清迟到结果。原票据与 auth.refresh 4 项、runtime 20 项通过；旧扫码 UI/IPC/契约/样式/文案与专用测试已删除。macOS/Windows 真环境与真实更新由用户验收，见 [实施记录](../IMPLEMENTATION.md)。


2026-10-15 状态复核：本地实现/检查记录保留，真实环境验收尚未提供，当前等待用户验收证据；不以重复本地测试代替真实结果。
