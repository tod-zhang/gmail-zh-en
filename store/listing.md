# Chrome 应用商店上架信息

上传包：`dist/gmail-zh-en-<version>.zip`（`zip` 命令见 README）

## 商品详情（Store listing）

**说明（Description）**

在 Gmail 回复框里用中文写，一键翻译成地道的英文商务邮件。

· 回复框「发送」旁边多一个「译 英文」按钮，也可以按快捷键 Ctrl+Shift+Y（Mac 是 ⌃⇧Y）
· 弹出预览：上面是中文原文，下面是英文译文，可以直接修改，确认后替换到回复框
· 替换后 8 秒内可一键撤销，恢复中文
· 发送前检查：点「发送」或按 ⌘Enter 时，如果你写的内容里还有中文，会先提醒你翻译，避免把中文误发给海外客户
· 只翻译你写的正文，签名和引用的原邮件保持不动；保留加粗、链接、图片等格式
· 参考你正在回复的那封客户来信，译文更贴合上下文
· 自定义术语表（如 机械密封 = mechanical seal），专业词汇固定译法
· 可选语气：专业友好 / 正式 / 简洁

使用前需要在设置页填写你自己的 DeepSeek API Key（platform.deepseek.com）。翻译由 DeepSeek 完成，插件本身没有服务器，不收集任何数据。

**类别（Category）**：Communication（沟通）
**语言（Language）**：中文（简体）

**图片**

- 商店图标：`icons/icon128.png`
- 屏幕截图：`store/screenshot-1-panel.png`、`store/screenshot-2-replaced.png`（1280×800）
- 小型宣传图块：`store/promo-small-440x280.png`

## 隐私权（Privacy practices）

**单一用途（Single purpose）**

把用户在 Gmail 回复框里写的中文翻译成英文，并在发送前提醒用户翻译仍是中文的内容。
Translate the Chinese a user writes in the Gmail compose box into English, and remind them before sending if Chinese text remains.

**权限理由（Permission justification）**

- `storage`：在本机保存用户的 DeepSeek API Key 和翻译设置（语气、术语表、开关）。
  Stores the user's DeepSeek API key and translation settings (tone, glossary, toggles) locally.
- 主机权限 `https://mail.google.com/*`：在 Gmail 回复框旁边加入翻译按钮，读取用户正在写的草稿并把译文写回，发送前检查草稿里是否还有中文。
  Adds the translate button to Gmail's compose box, reads the draft being written and writes the translation back, and checks the draft for remaining Chinese before sending.
- 主机权限 `https://api.deepseek.com/*`：把草稿发给 DeepSeek API 生成英文译文。
  Sends the draft to the DeepSeek API to produce the English translation.

**远程代码（Remote code）**：否，我没有使用远程代码。No, I am not using remote code.

**数据使用（Data usage）**

- 勾选：个人通讯（Personal communications）—— 用户点翻译时，草稿和被回复邮件的内容会发给 DeepSeek 用于翻译。
- 其余类别都不勾选。
- 三项声明全部勾选：不出售或转让给第三方（用于提供功能除外）；不用于与单一用途无关的目的；不用于判断信用或放贷。

**隐私权政策网址（Privacy policy）**

https://gist.github.com/tod-zhang/208afecb498792a026bf58ff0d0c7d44

## 分发（Distribution）

- 公开范围（Visibility）：不公开（Private）
- 测试人员（Trusted testers）：在开发者账号设置（Account）里添加，目前只有开发者本人
- 地区：所有地区
