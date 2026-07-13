# Worklets pnpm Realpath Bundle Mode 修复设计

## 目标

修复 `react-native-worklets@0.8.3` Bundle Mode 在 pnpm peer-suffix realpath 下把 Reanimated 文件误判为 Worklets 包内文件的问题，避免生成的 Worklet 在独立 Runtime 中加载 `react-native` 并触发 `Platform.OS` 空值异常。

## 根因

Worklets Babel 插件通过 `filename.includes('react-native-worklets')` 判断相对 import 是否允许转发。pnpm 将 peer 依赖编码到 Reanimated 物理目录名中，例如：

```text
react-native-reanimated@4.3.1_react-native-worklets@0.8.3_...
```

该子串导致 Reanimated 被误判为 Worklets 自身代码。错误生成物保留对 Reanimated `common/constants` 的 import；该模块读取 `Platform.OS`，但 Worklet Runtime 禁止顶层 `react-native` import，因此 `Platform` 为 `undefined`。

## 设计

使用 pnpm dependency patch，仅修改 `react-native-worklets/plugin/index.js` 中的包路径判断：

- 将普通子串匹配替换为标准化后的路径边界匹配。
- 保持真正的 `react-native-worklets`、`react-native/Libraries/Core/setUpXHR` 和显式 `workletizableModules` 行为不变。
- POSIX 与 Windows 路径都先转换为 `/` 再判断。
- 不修改 Reanimated、业务动画、Metro resolver 或 Worklets 原生实现。

补丁保存在 `patches/react-native-worklets@0.8.3.patch`，并通过 app `package.json` 的 `pnpm.patchedDependencies` 注册，供独立 app 安装及 EAS 使用。workspace 根安装仍需要用户在 workspace 根配置同一补丁，因为根 workspace 配置不属于当前仓库。

## 失败保护与测试

新增真实插件回归测试：

1. 使用 Node 将补丁应用到内存中的 Worklets 插件源码副本，不依赖系统 `patch` 命令。
2. 使用 Babel 对带 pnpm peer-suffix filename 的 Reanimated 风格 worklet 做转换。
3. 截获生成文件，验证 `IS_IOS` 被捕获进 closure，而不是保留 `../../constants` import。
4. 同时验证真正 Worklets 包路径在 POSIX 与 Windows 下仍允许相对 import 转发。

## 约束

- 不修改任何 lock 文件。
- 不运行依赖安装。
- 不直接修改 `node_modules`。
- 保留现有 Bundle Mode、Metro `.generated` 解析和 Worklets 预生成流程。
- 用户安装补丁后再执行真实 Android Runtime 验证。

## 验收标准

- 回归测试在补丁不存在时失败，补丁存在后通过。
- pnpm peer-suffix 中出现 `react-native-worklets` 不再命中允许列表。
- 真正的 Worklets 包路径及 Windows 路径仍正确命中。
- 完整测试、类型检查和静态格式检查通过。
- 用户手动刷新 lock/安装后，Android 日志不再出现 `jsEngine: 'Worklets'` 的 `Platform.OS` 异常。
