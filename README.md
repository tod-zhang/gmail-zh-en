# 中译英回复 for Gmail

在 Gmail 回复框里用中文写，一键翻成英文商务邮件（DeepSeek）。发送前会检查有没有漏翻的中文。

## 安装

1. Chrome 打开 `chrome://extensions`，右上角打开「开发者模式」。
2. 点「加载已解压的扩展程序」，选这个 `gmail-zh-en` 文件夹。
3. 自动弹出设置页：填 DeepSeek API Key，点「保存并测试翻译」。
4. 刷新 Gmail 页面。

## 用法

- 回复框「发送」旁边有个「译 英文」按钮，或按快捷键 `⌃⇧Y`（Windows 是 `Ctrl+Shift+Y`，可在 `chrome://extensions/shortcuts` 改）。
- 弹出预览：上面是中文原文，下面是英文译文，可以直接改。确认后按 `⌘↵` 替换。
- 替换后底部有「撤销」，8 秒内可以恢复中文。
- 点「发送」或按 `⌘Enter` 时，如果你写的部分还有中文，会先拦下来：可以「替换并发送」「只替换」或「不翻译，直接发送」。
- 签名和引用的原邮件不会被翻译，也不会触发拦截。

## 出问题时

Gmail 改版可能让按钮不出现或拦截失效。打开 Gmail，按 `⌥⌘I` 打开控制台，把带 `[Gmail 中译英]` 或 `TrustedHTML` 的红色报错发给我。选择器都集中在 `content.js` 开头。

修改代码后：在 `chrome://extensions` 点插件的刷新按钮，再刷新 Gmail 页面。

## 文件

| 文件 | 作用 |
|---|---|
| `content.js` / `content.css` | 注入 Gmail：按钮、预览面板、发送拦截、写回 |
| `background.js` | 调 DeepSeek API（Key 只在这里用） |
| `options.html` / `options.js` | 设置页 |
| `defaults.js` | 默认设置、语气、术语表 |

## 发布到 Chrome 应用商店

1. 改 `manifest.json` 里的 `version`（每次上传都要比上次大）。
2. 打包（不含 `dev/`、`store/`）：

   ```bash
   V=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])"); mkdir -p dist; zip -q -X dist/gmail-zh-en-$V.zip manifest.json background.js content.js content.css defaults.js options.html options.js icons/*.png
   ```

3. 在 [开发者后台](https://chrome.google.com/webstore/devconsole) 上传 ZIP。商店文案、权限说明、隐私政策链接见 `store/listing.md`，截图在 `store/`。
