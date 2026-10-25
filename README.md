# dsh-vision-all

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)

一刀切视觉声明：给 DSH 里**所有** llm provider（包括以后新增的）自动补上
`defaultInput: ["text", "image"]`。

## 它解决的是什么问题

OpenAI 兼容协议里，一个模型支持哪些输入模态是靠 `/v1/models` 返回的元数据声明的。
但大量中转站**根本不填这个字段**，或者填了假的 `vision: false`，而实际上游是
能看图的模型。

DSH 会读这个声明，读到「没声明支持图片」就把图片入口关掉。于是明明能看图的模型，
在界面里粘不了图。

这个插件把这道判断绕过：不管声明写了什么，一律放行 `image`。

**它的前提是：你的 provider 上游确实具备视觉能力。** 这不是给纯文本模型「外挂」视觉
——它不做任何图片转译，只是不再因为声明的缺失而拦截。如果你需要的是给真正的纯文本
模型加视觉，那是另一类插件（把图发给视觉模型、转成文字再回传）。

## 安装

从 GitHub 安装：

```powershell
# Windows：用 DSH 自带的 pnpm
cd $env:USERPROFILE\.dsh\profiles\desktop
node "D:\dsh\resources\runtime\primary-runtime\dependencies\node\bin\node.exe" `
     "D:\dsh\resources\runtime\primary-runtime\dependencies\pnpm\bin\pnpm.cjs" `
     add github:GGBound-1229/dsh-vision-all
```

然后在 `package.json` 的 `dsh.profile.bundles` 数组末尾加上包名：

```json
"bundles": [
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "dsh-vision-all"
]
```

**两步都要做。** 只加 `dependencies` 不加 `bundles`，包在磁盘上但 DSH 不会加载它；
只加 `bundles` 不加 `dependencies`，DSH 找不到包。

改完重启 DSH。

## 验证它生效了

默认日志写到：

- Windows：`%LOCALAPPDATA%\dsh-vision-all\debug.log`
- Linux/macOS：`~/.local/state/dsh-vision-all/debug.log`

每次启动应当看到类似：

```
APPLY ran
hook registered
provider hw defaultInput=["text","image"]
provider ox defaultInput=["text","image"]
patched 9 providers
```

`patched N providers` 里的 N 就是被补上图片支持的 provider 数量。

如果启动后没有这个文件，说明插件没被加载——先检查 `bundles` 里是否真的加了包名。

## 配置

| 环境变量 | 作用 |
|---|---|
| `DSH_VISION_ALL_LOG` | 覆盖日志路径；设为 `off` 则完全不写文件 |

```powershell
# 关闭日志
$env:DSH_VISION_ALL_LOG = "off"
```

## 关闭插件

在 profile 的 `cordis.patch.yml` 里加：

```yaml
- id: dsh-vision-all
  name: dsh-vision-all
  config:
    enabled: false
```

或者直接从 `dsh.profile.bundles` 里删掉包名。

## ⚠️ 改这个插件前必须知道的事

它监听的是 **`internal/config` 这个全局事件**，而且是 waterfall 式监听。

关键在于：**`internal/config` 对每一个插件的配置解析都会触发一次。**
所以这个 listener 里一旦抛异常，**所有插件的初始化都会失败，DSH 起不来。**

这不是理论风险。这个插件最初的版本写成：

```js
ctx.on('internal/config', function (fiber, config, next) { ... })
```

Cordis 的 waterfall 监听器签名是 `(payload, next)`，`this` 才是 fiber。
把 fiber 写成第一个参数，`next` 就变成了 `undefined`，调用 `next()` 直接抛异常。
后果是整个插件树初始化失败，其它插件全部「失效」。

正确写法（当前代码）：

```js
ctx.on('internal/config', function (config, next) {
  const out = typeof next === 'function' ? next() : config
  // ... 处理
}, { global: true })
```

两条硬性要求：

1. **listener 体必须整体包在 try/catch 里**，任何异常都要吞掉并返回原配置；
2. **不要在校验 `next` 是否为函数之前调用它。**

## 它做了什么（实现细节）

在 `internal/config` 里检查配置对象有没有 `providers` 字段：

- 没有 → 原样返回（这不是 llm provider 的配置）
- 有 → 遍历每个 provider，判断它看起来是不是一个 provider 配置
  （有 `models` / `baseURL` / `apiKeyEnv` / `api` 之一）
- 对每个 provider，把 `image` 合并进 `defaultInput`，并保证 `text` 存在

只增不减：原本就有 `defaultInput` 的不会被覆盖，只会在缺 `image` 时补上。

## 许可证

MIT
