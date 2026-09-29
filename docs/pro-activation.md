# MDA Pro 购买与激活说明

> Pro **仅**解锁 AI（改写 / 续写 / 翻译 / 解释 / 总结）。其余能力均为 Free。
> 正式购买渠道尚未上线。激活只认本机密钥签发的激活码。

## 激活步骤

1. 启动 MDA → **视图 → 设置…**（`Ctrl+,`）→ 左侧 **Pro**
2. 粘贴激活码 → **激活**
3. 切到左侧 **AI**，选择 Provider（OpenAI / DeepSeek / 自定义），填写 Base URL 与 API Key，并确认至少有一个已启用的模型
   - Key 使用系统加密保存在本机，**不会**上传到 MDA 服务器
   - 输入框留空再保存会保留已存 Key；「清除 Key」后保存才会删掉
4. AI 只在**预览编辑**模式可用（2.0 源码模式会提示切换）。入口：
   - 菜单「AI」或 `Ctrl+J`：命令条
   - `Ctrl+Shift+Enter`：续写
   - `Ctrl+Shift+M`：润色
   - 工具栏 AI 按钮、右键「AI 帮我改 / 问问 AI / AI 帮我写」、块手柄 AI 子菜单

## 本机签发

签名密钥放在 `src/pro/license-secret.js`（已加入 `.gitignore`，不要提交、不要写进文档）。文件不存在时，签发脚本直接拒绝，程序也保持未激活。

有该文件时，在仓库根目录执行（默认永不过期；`--days 365` 为一年）：

```bash
node scripts/generate-license.js
node scripts/generate-license.js --days 365
```

把打印出的 `MDA1.…` 整行粘贴到「设置 → Pro」。

## 激活码格式

```
MDA1.<payload>.<signature>
```

- 合法签名且未过期 → 解锁 Pro
- 非法 / 篡改 / 过期 → 拒绝，保持 Free
- 签发与校验使用同一把本机密钥；密钥文件不入库

## 隐私与安全

- AI 请求从 Electron 主进程直连你配置的 Base URL，不经 MDA 中转
- 渲染进程看不到 Key 明文
- 未激活时点 AI 只提示升级，不会发出网络请求
