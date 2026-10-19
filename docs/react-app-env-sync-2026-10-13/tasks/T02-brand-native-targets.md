# T02 独立品牌变体与原生配置

[返回总览](../README.md)

状态：**未开始**。前置：[T01](T01-environment-contract.md) 的契约已稳定。交付后进入 [T03](T03-entry-session-binding.md)。

## 目标与范围

生成两个品牌、三个环境的固定应用目标；安装身份独立，EAS 项目共用。Expo、原生壳、JS 使用同一目标，不再依赖共享壳加全品牌 registry。

## 先读入口

- [品牌生成](../../../scripts/lib/brand-config.js)、[同步入口](../../../scripts/sync-brand.js)、[Expo 配置](../../../app.config.js)、[EAS 配置](../../../eas.json)、[品牌源](../../../brands/)。
- [安装壳品牌解析](../../../src/shared/branding/installedBrand.ts)、src/shared/generated/、assets/brands/、[品牌测试](../../../scripts/tests/brandConfig.test.mts)。
- Android Gradle/Manifest/Kotlin 入口；iOS project、Info.plist、Expo.plist。原生目录是生成或本地状态，先检查当前存在内容并保护本机改动。
- 先读 app-shell-navigation、shared-visual-foundation 和 app-startup 的 XGraph 卡片，说明影响安装、启动资源与更新链路。

## 必须完成

1. 各 brands/<brand>/brand.json 声明 Android/iOS 基础应用标识；development 追加 .dev，preview 追加 .preview，production 使用基础标识。核对六个目标在各平台唯一；实际 ID、签名、URL scheme 和商店记录正确对应，不把示例值当成已注册资源。
2. brands/shared.json 保留共用 EAS projectId、slug、updates URL 和公共规则；移除被替代的共享 nativeIdentity。数据命名空间、应用名称及 scheme 与目标对应；品牌资源仍由现有缓存流程生成，开发/预览名称标出环境。
3. App version 仍来自 package.json；构建号按应用标识和平台维护。channel 固定为 <brand>-<environment>，runtimeVersion 固定为 <brand>-<environment>-<appVersion>，不含 env 版本或构建号。
4. 生成单目标品牌常量、资源入口和环境配置，移除不再需要的全品牌运行时 registry、动态选择与静默回落。原生安装壳品牌/环境与 Bundle 不一致时明确失败；Web 使用静态目标，无需模拟原生壳。
5. 同步 Android/iOS 原生的显示名、安装标识、scheme、更新 URL、channel 请求头、runtimeVersion 和应用版本。校验真实生成工程，不能只读 app.config.js 宣称一致。修正 iOS Expo.plist 未随品牌脚本更新造成的漂移。
6. Android 保留现有 Kotlin package/namespace，只改变 applicationId；使用正确的全限定 Application/Activity 类名或既有可验证启动参数，修复 Expo 按新 applicationId 推断旧 .MainActivity 的启动问题，不批量搬移 Java/Kotlin 源目录。
7. 用现有配置插件/生成入口处理原生差异，保留 app.config.js 不写 native 文本的边界。正式目标使用独立构建目录；一个本地工作区同时只准备一个目标，切目标必须重启 Metro，不建设并行构建调度器。
8. 两品牌正式商店记录和 submit profile 分开；共用 EAS 项目不复用同一 ascAppId。通过明确 build ID/IPA 匹配目标提交，不保留 --latest 的猜测入口。外部登记与实际提交分别记录，不把配置完成等同于上架。

## 防止过度设计

只做品牌字段＋三种环境的固定派生。不要新增 flavor 框架、品牌插件、模板引擎、运行时切换 UI、可任意配置的 channel/runtime 策略或新的 EAS 项目。图标生成、预生成缓存和 Worklets 链路保持复用；被替代的共享身份及全 registry 分支删除，不留兼容模式。

## 验收

- 六目标 × Android/iOS 的静态配置唯一且一致，重复准备不会无故重画资源。
- 两品牌、同品牌不同环境实际可并排安装；名称、图标、启动图正确，本地数据隔离。
- Android 用既有 Expo 调试入口可以启动真实 Activity；iOS/Android 原生更新 URL/channel/runtime 与目标匹配。
- 目标 Bundle 只消费目标品牌；不匹配壳/Bundle 不会启动成默认 ZenMind。
- 修改原生能力必须提升共用版本并重新构建，不能把不兼容变更当 OTA 发布。
- 补充安装身份、启动组件与壳/Bundle 不匹配的行为验证；不能仅用源码字符串检查替代原生结果。

## 清理与记录

准备原生工程前记录 ios/android、generated、资源缓存和本地 Expo 状态的原状。配置检查也可能生成文件，必须纳入审计。删除自有临时构建目录，恢复临时切换，保护原有工程和未跟踪文件。同步已实施的品牌、壳层、视觉、启动 flow/rules；不得让旧“共享身份/共享 OTA”规则继续约束新实现。
