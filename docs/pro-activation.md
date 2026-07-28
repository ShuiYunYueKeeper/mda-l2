# MDA Pro 购买与激活说明

> Phase B（M7-6）。Pro **仅**解锁 AI 编辑助手（续写 / 补全 / 美化）；其余能力均为 Free。

## 购买

个人 Pro 定价倾向（需求文档）：**¥199 买断** 或年费档。当前开源仓库以离线激活码演示为主；正式购买渠道上线后会在本页与应用内「设置 → Pro」更新链接。

临时说明与更新见仓库：[mda-l2](https://github.com/ShuiYunYueKeeper/mda-l2)。

## 激活步骤

1. 启动 MDA → **视图 → 设置…**（`Ctrl+,`）→ 左侧 **Pro**
2. 粘贴购买后获得的激活码 → **激活**
3. 在同一页配置 AI Provider（OpenAI / DeepSeek / 自定义 Base URL）与 API Key  
   - Key 使用系统 `safeStorage` 加密保存在本机，**不会**上传到 MDA 服务器
4. 在编辑栏使用：
   - **续写** `Ctrl+Shift+Enter`
   - **补全** `Ctrl+Space`
   - **智能美化** 菜单「视图 → AI 智能美化…」或快捷键 `Ctrl+Shift+M`

## 激活码格式

```
MDA1.<payload>.<signature>
```

- 合法签名且未过期 → 解锁 Pro
- 非法 / 篡改 / 过期 → 拒绝，保持 Free
- 开发调试解锁（**须启动 GUI 时生效**，写在 `build:gui` 后面无效）：

```bash
# 推荐（跨平台）

# 或环境变量（PowerShell）

# 或环境变量（cmd）
```

运营侧签发（开发密钥，发正式版前须轮换 HMAC）：

```bash
node scripts/generate-license.js
node scripts/generate-license.js --days 365
```

## 隐私与安全

- AI 请求从 **Electron 主进程**直连你配置的 Base URL，不经 MDA 中转
- 渲染进程看不到 Key 明文；错误提示会脱敏
- 未激活用户触发 AI 时仅见升级提示，不会接触 Key 存储逻辑的敏感输出
