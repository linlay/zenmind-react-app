# 本地实现状态与验收交接（2026-10-09）

最新范围：**云端保持现状，T03 暂缓**。代码已按修订计划收敛：逐项撤除 Platform 的 T03 改动（52 个已跟踪文件、5 个任务新增文件），该仓库工作区恢复干净；App 云端 HTTP、WS 和同源资源沿用原有 `authMode/accessToken`，不向云端发送手机 Identity JWT。真实环境联调与真机验收由用户执行，本记录不声称已部署。

此前[跨项目影响评估](impact-assessment.md)发现的三项云端问题所对应补丁已撤除，报告保留历史证据。Desktop 远端撤销失败阻断本地退出已修复：失败时仍停止 tunnel、退出本地 SSO、清理 cookies，并提示账号设备撤销待重试。当前范围的本地改造与回归已完成；构建缓存原状态无法核实的清理例外及适用的真实验收仍未关闭。

此前影响评估只更新报告、计划状态与 XGraph 上下文；四项临时诊断探测复现了当前行为，业务代码未改。清理审计以评估开始时十个仓库的文件 hash、HEAD、分支、暂存区和本地 Git 配置摘要为基线，核对文档外的既有状态，并清除本轮临时 overlay、测试文件和 Go 缓存。具体风险与后续最小处理范围见报告。

| 任务 | 本地进度                                                                   | 未完成项                                                       |
| ---- | -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| T00  | 已核实本地账号 JWT、canonical OAuth、本地 Platform 主体与接口缺口          | 单个云端 Platform 已确认；目标环境版本、地址由用户实际验收记录 |
| T01  | App 单次读取 Hub Desktop 目录；归属 SQL 与 Manager 在线查询已实现    | 实际环境验收；Identity 只管理登录会话                      |
| T02  | 账号电脑授权已实现；远端撤销失败仍完成本地退出，回归通过                   | 旧远程客户端升级边界与真实验收                                 |
| T03  | 暂缓；Platform 任务补丁已撤除，工作区干净                                  | 本阶段不改云端，恢复该任务须由用户明确决定                     |
| T04  | 账号与来源生命周期已实现；云端恢复原有凭证，不用手机 JWT 或错误刷新重试    | 两账号与真机验收                                               |
| T05  | 新账号/来源 SQLite scope、一次性清旧缓存、单源同步、迟到结果失效已实现     | 真实切源长任务/离线/outbox 验收                                |
| T06  | WebApps 网关和池跟随账号所选电脑，云端显示能力空态                         | 真机 WebView 及实际电脑目录 UUID 校验                          |
| T07  | 用户页六入口、内联主题、About 二级页和开发态三连点已实现                   | 真机视觉验收                                                   |
| T08  | 来源下拉、底部来源抽屉、较窄侧边浮层、未登录插图、取消全局新对话按钮已实现 | iOS/Android 返回/遮罩/下滑、safe area 验收                     |
| T09  | 新范围代码收敛、本地检查、文档同步和清理审计已执行                         | 用户真实环境与真机验收、构建缓存清理例外；T03 不作前置         |

## 代码边界与性能

- `activeDesktop` 是唯一来源选择真源；`accountDesktopSource` 在通知前同步交接 SQLite 与选择，再初始化并连接；普通失败回滚，权威撤销后提示原因并保持云端；明确离线选择不请求远端凭证。
- 每个账号/来源独立 SQLite 文件，在目录分页、计数和搜索之前隔离。repository 的异步边界检查 scope；旧结果不能继续写入新来源。
- Chat 只保留一个 activeService，切源释放手机连接，不取消已提交远端任务。WebApps 继续复用共享 transport。
- 历史 T03 补丁复用 source 列在 SQL 中隔离后分页/计数，并改变资源、推送和部分工具权限；不属于当前交付目标。云端现有管理、Memory、Workspace、Host Bash 等能力保持原契约，兼容性问题见影响评估。
- 路由签发单飞，只缓存当前来源；每次 WS 认证换新 JTI。Desktop 验证使用十秒结果窗口与单飞，复用三十秒心跳复验；撤销仅关闭所属手机连接。
- 已删除旧 AppAccess/Profile、旧配对客户端、旧配对扫码组件、闲置设备名/URL 迁移辅助代码及 50 条闲置文案和仅服务于旧登录/迁移的测试。账号挑战扫码仍在使用，保留 camera 依赖。没有新增依赖、租户表或通用框架；手机按既有 SQLite scope 版本清旧缓存，服务端 schema 保持原状。

## 此前本地检查（非本次计划修订结果）

- App：全量 `scripts/tests/*.test.mts`、`tsc --noEmit`、相关 ESLint 通过。
- Web：在独立临时副本执行 `expo export --platform web` 通过；这不是 Native 或真实账号验证。
- Hub：`go test ./internal/auth ./internal/store ./internal/config ./internal/desktop` 通过，含实际 yamux 存活/关闭、离线、跨账号与权威服务失败测试。
- Desktop：主进程 TypeScript 编译、640 文件/20 模块 architecture check、86 项 WS/Tunnel/登记/设置/SSO/账号路由回归通过。
- Desktop 登记仅保存 Hub 权威确认的 accountId 标记；退出先撤销后停止 tunnel，释放已撤销账号 UUID；迟到登记结果不能覆盖新会话或撤销结果。未登记账号电脑时不调用撤销。
- Identity：经用户明确授权，原仓库已应用三文件补丁；`GOTOOLCHAIN=local GOPROXY=off GOCACHE=<临时路径> make backend-test` 全量通过，涵盖账号设备/路由签发、错误账号/目标、手机撤销、电脑撤销、OAuth 撤销。接口文档已同步。
- Platform：双账号 HTTP/WS、列表/搜索先于分页、详情/导出/资源/引用、派生/归档/恢复、置顶/未读、同账号换票/跨账号拒绝、推送/撤销/SSE 与文件工具边界回归通过；原仓库 `go test -mod=readonly -p 4 ./...` 首轮除两项计时/推送时序测试外通过；单例及 `go test -mod=readonly -p 1 ./internal/server ./internal/runtime/query ./internal/runtime/session ./internal/ws ./internal/hostenv` 全量复跑全部通过。
- XGraph：index/sync/status 已执行，最后状态与清理审计见本轮报告。

## 实际验收顺序（用户执行）

1. 按设备与电脑授权契约准备 Identity/Hub/Desktop/App，Hub 的 `IDENTITY_API_BASE_URL` 仅用于账号设备链路；目标环境配置由用户执行。云端沿用现有部署，不启用新账号模式、不修改 issuer/key、不部署 T03 补丁。
2. 用两个账号、两台电脑：确认只列所属有效电脑；在线来自实际 tunnel，离线选择保留，列表刷新故障不误撤销。
3. 云端/电脑 A/电脑 B 切换：目录、搜索、详情、资源和 WebApps 不串源；云端原有 Token/Cookie 和 API 可正常使用，返回重进和启动恢复一致，不新增云端隔离验收。
4. 在长任务运行中切源/手机退出：任务继续，切回通过既有同步恢复；迟到 HTTP/WS/SQLite 请求不写入新来源。
5. 手机/电脑撤销、跨账号、错误目标、过期及 JTI 重放均拒绝；手机退出不退出电脑。另在 Hub/Identity 不可用时退出 Desktop：确认本地退出和访问停止，界面提示远端撤销未完成；恢复后在设备管理重试。
6. 两平台检查未登录空态、来源抽屉下滑/返回/遮罩、底栏安全区、主题、About 及开发入口。

## 审批与清理状态

用户于 2026-10-09 明确回复“允许应用 Identity 补丁”；此前认证边界审批阻塞已解除。原样应用已审阅补丁，通过全量后端检查并补接口文档。最新要求云端保持现状、先不改，T03 已暂缓，其 Platform 代码补丁已逐项撤除。

当前交付保留 App、Identity、Hub、Desktop 的必要改动，可直接审阅各仓库的 Git diff；Platform 无本次改动。实际环境、密钥、凭据、依赖与 lock 文件没有变更，原有用户改动保留。

最终审计已核对五仓库 Git status/diff、HEAD、分支、暂存区和依赖声明；任务范围外文件与初始基线一致。实际环境、代理和凭据未修改，仅更新已授权的配置模板。临时验证副本、Go 缓存、补丁、测试日志与基线材料已清除，原有用户状态保留。

## 此前计划修订与清理

仅调整云端暂缓范围、依赖、契约、验收记录和 XGraph 任务入口；清除指向已删除 `appAccess.ts` 的过期文档链接。五仓库业务代码、HEAD、分支、暂存区及 Git 配置与本次开始时一致，原有改动保留；未创建工程临时文件。文档格式、相对链接、任务依赖、差异检查与 XGraph 状态通过。本次没有执行业务测试、回退云端补丁或修改真实环境。

## 修订计划的代码执行与验证

- App：4 个实现文件恢复云端既有凭证及账号请求边界；云端 401 不再触发 Identity 刷新重试，外部资源不携带凭证。保留手机登录、唯一来源及迟到请求失效规则。相关测试 21 项、全量测试 709 项、TypeScript 和相关 ESLint 通过；隔离副本的 Web 导出通过。
- Desktop：仅调整退出 handler、两份语言字典、鉴权文档和 SSO 测试。远端撤销失败不阻断本地退出，且不伪报远端撤销成功。主进程 TypeScript、architecture check（640 文件、20 模块）、字典校验（3822 键）、SSO/登记/账号路由/WS 回归 62 项通过。
- Platform：逐项反向应用已核对的 T03 差异，删除 5 个任务新增文件，未整仓 reset。恢复后的全量 Go 回归在隔离副本中只有一项资源路径测试因源码位于系统临时目录而失败；原仓库整个 `internal/server` 包复跑通过，其余包在副本通过。未为测试改动原有源码。
- Identity 与 Hub：本轮未修改；保留此前验证记录。未部署、未修改真实配置，未安装依赖。

清理审计记录：五仓库 HEAD、分支、暂存区及本地 Git 配置均与执行前基线一致；Identity/Hub 文件 hash 全部未变，Platform 干净；App 与 Desktop 的变更仅落在上述实现、测试、文档和 XGraph 派生文件中，范围外文件及依赖/lock 保留。五仓库 `git diff --check`、文档格式/本地链接、XGraph index/sync/status 均通过。原仓库源码树没有新增的忽略文件。临时验证副本、Go 缓存、日志和基线材料在审计后清除。

**清理例外（尚未关闭）**：Web 验证副本共享了原仓库 node_modules，生成器更新了下列已存在的忽略构建缓存；执行前未保存其内容，无法核实原状态，不能删除或声称完全恢复。未安装或变更依赖版本。

- `node_modules/react-native-css-interop/.cache/{native.js,ios.js,macos.js,windows.js,android.js,web.css}`：6 个已存在缓存文件更新。
- `node_modules/react-native-worklets/.worklets/*.js`：427 个已存在生成文件更新。

以上路径通过 pnpm 链接指向本仓库 `node_modules/.pnpm` 内对应包目录。归属不明的原状态保留，不执行删除。需要从当前源码重建开发缓存时，在 App 根目录运行 `pnpm start --clear`（先执行既有 prepare:bundle，再启动并清理 Metro 缓存）；Web 单独验证使用 `pnpm web --clear`。这些命令重建当前状态，不能恢复未保存的历史缓存。精确恢复历史内容只能使用用户已有备份；本任务不替用户作该选择。真实环境和 Native 验收继续由用户执行；因上述清理例外与待验收项，任务总状态保持进行中，不能声明全部完成。

## 后续计划审计与补漏

本轮从当前代码逐项下钻 T00–T09，并补齐三处遗漏：Web 用户页滚动内容使用实际 tab bar height（Native 保留现有 interface safe area）；应用空态移除固定 96px 避让；repository 共用新建入口在 insert 前检查当前账号来源，并拒绝已知离线电脑，保留所属已有会话的离线只读。没有增加数据库查询、连接或状态框架，未修改云端及其他仓库。

- 新增 `chatConversationSourceCreation.test.mts` 执行实际 repository 创建函数，覆盖未登录、跨账号/来源、离线 Agent/Team 零写入与正常创建。与来源选择、repository 性能边界、用户页、WebApps 导航和浮层尺寸回归共 25 项通过。
- 本轮 App TypeScript 与上述三份实现的 ESLint 通过。未重复 Web 导出或全量生成测试；此前 709 项全量记录属于修订计划执行时的版本，本次变更使用相关回归验证，不能将旧总数描述为本轮全量结果。
- T00–T02 的真实版本、设备/隧道/凭证验收，T05 长任务与离线，T06 Native WebView，T07/T08 视觉、手势和安全区仍由用户验收。通知点击只有带当前账号/来源编码的 ID 才进入详情；无归属旧 payload 不能自动认领。云端原 payload 的可用性需用户核对，本阶段不修改云端推送格式；App 没有另加深链解析入口。

本轮修改前记录五仓库文件与 Git 元数据，并记录原有两处依赖构建缓存的 hash/mtime；结束复核原有改动、依赖和配置，清除本轮创建的临时基线。前一轮缓存原状态未留基线的例外仍保持未关闭，不以本轮验证代替历史恢复。

## 2026-10-12 账号设备职责收敛

源码已完成四端收敛：Identity 只管理账号登录会话，保留密码/邮箱登录与凭据轮换；Hub 管理 Desktop 目录、改名、持久解绑、在线状态及两分钟内存随机票据；Desktop 验证票据并保留本地业务主体；App 删除双目录、信任等级和设备事件链路，账号扫码确认入口已移除。云端、聊天模型及历史分享未改；未提交、推送或部署。

验证：Identity 全量 go test -race ./... 通过，含并发一次性扫码和单赢家凭据轮换；Hub 相关模块与 SQLite v3 副本 -> v4 保留数据测试通过；App 712 项测试、TypeScript、相关 ESLint 与 Web 导出通过；Desktop 89 项相关回归、Main 类型编译及架构检查通过；XGraph index/sync/status 和四仓库 diff --check 通过。

验证限制：Hub 全量测试中的 TestEmbeddedAssetSetDirectoryMatchesContentHash 仍因已有 3d641 资源集目录/hash 不一致失败，相关资源与 HEAD 相同且本次未修改；中性词工具缺少 FORBIDDEN_BRAND_TERMS 外部名单，无法运行，不能报告该工具通过；未配置 TEST_MYSQL_* 独立验收库，MySQL 增量升级尚未做真实引擎验收。真实手机/电脑及账号、issuer、公钥对齐仍需发布前验证。

清理：真实配置、密钥、lock、Git 配置/HEAD/分支与续作基线一致，范围外源码保留；.expo 恢复到 Web 构建前，其他已记录生成目录未变。本任务临时测试副本、导出、日志、基线及中断测试夹具在审计后移除。

**本轮清理未完成项**：Web 导出重写了 node_modules/react-native-css-interop/.cache 的 native.js、ios.js、macos.js、windows.js、android.js、web.css，以及 node_modules/react-native-worklets/.worklets 的 427 个已有文件。未记录这两处本轮执行前内容，无法确认或精确恢复原字节；不删除或覆盖归属不明的历史缓存，准确路径及当前 hash 见 cache-audit-2026-10-12.json。恢复原状态只能使用已有备份；pnpm start --clear 或 pnpm web --clear 仅能重建当前源码的缓存，不能还原未保存的历史内容。按用户提供的清理规则，任务整体保持未完成，除非用户明确接受保留当前生成缓存作为清理例外。
