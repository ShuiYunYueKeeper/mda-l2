# 上架流程（Microsoft Store + GitHub Release）

商店上架的是**完全免费**的桌面应用。3.1.0 起应用内不再有任何 AI 功能、Pro 入口或内购（`src/gui/edition.js` 里 `ai: false`、`pro: false`），所有能力直接可用。店外安装包发到 GitHub Release。

联系邮箱：mda.markdown@gmail.com  
隐私说明：<https://github.com/ShuiYunYueKeeper/mda-l2/blob/master/docs/privacy.md>  
店外发布页：<https://github.com/ShuiYunYueKeeper/mda-l2/releases/tag/v3.1.0>

相关文档：[隐私说明](privacy.md)、[Windows 打包与更新清单](packaging-windows.md)。（[pro-activation.md](pro-activation.md) 是 3.0.0 及更早版本的 Pro 说明，3.1.0 起已下线，仅供历史查证。）

下面的截图来自合作伙伴中心这次提交。发布者字符串以第 2 节表格为准，不要对着截图手敲。

---

## 1. 两条渠道

| 渠道 | 用户拿到什么 | 怎么付钱 | 包 |
|------|----------------|----------|----|
| Microsoft Store | 免费安装「Markdown工作台」 | 完全免费，应用内没有任何收款入口 | `.appx`（MSIX） |
| GitHub Release | Windows 安装包 / 便携版 / zip | 同上，完全免费 | `MDA-3.1.0-win-x64.exe` 等，外加 `latest.yml` |

商店包由微软在认证通过后重新签名，不需要购买 Authenticode 证书。店外 EXE 未签名时，SmartScreen 可能拦截；那是另一件事，见 [packaging-windows.md](packaging-windows.md)。

应用完全免费，商店与店外都不收款。定价页选免费，不要填任何价格。

---

## 2. 包身份（逐字一致）

合作伙伴中心「产品身份」页上的字符串，必须和 `package.json` → `build.appx` 完全一致。差一个字符，包系列名就会对不上，上传会被拒。

| 字段 | 值 |
|------|----|
| 保留的商店名称 | Markdown工作台 |
| 包标识名 `identityName` | `ShuiYunYueKeeper.Markdown` |
| 发布者 `publisher` | `CN=E74AF55B-DEC8-4E12-9D12-FF587E356B53` |
| 发布者显示名 | `ShuiYunYueKeeper` |
| 应用 ID | `Markdown` |
| 显示名 | Markdown工作台 |
| 语言 | `zh-CN`、`en-US` |
| 商店 ID | `9NHCDVGK8BVL` |

名称「Markdown工作台」可以保留。「MDA」三个字母已经被占用。

![保留商店名称 Markdown工作台](screenshots/microsoft-store/store-name.png)

产品身份从「查看产品标识」页复制。截图分辨率低，发布者以表格中的 `CN=E74AF55B-DEC8-4E12-9D12-FF587E356B53` 为准。

![合作伙伴中心的产品标识页](screenshots/microsoft-store/product-identity.png)

`productName` 仍是 `MDA`。GitHub 上的安装包文件名继续叫 MDA。软著全称是「Markdown工作台软件」，和商店显示名对齐；和三个字母的产品名不是同一件事。

当前 `win.target` 只有 nsis、portable、zip。`npm run dist:win` 不会打出商店包。

---

## 3. 商店提交流程

按这个顺序做。前面的身份和隐私页没对齐，后面的包一定被拒。

1. 注册合作伙伴中心，保留名称「Markdown工作台」（「MDA」已被占用）。
2. 确认产品身份四项：名称、发布者、发布者显示名、包系列名。把发布者整串抄进 `build.appx.publisher`，不要手改其中任何一位。
3. 隐私说明放在仓库 `docs/privacy.md` 并推到 `master`。商店「隐私政策 URL」填该文件的 GitHub 地址。
4. 打 `.appx`（保持未签名，商店认证通过后自己签）。
5. 在提交里删掉上次失败的包，再上传新包。
6. 填定价、属性、年龄分级、商店一览（中文和英语美国）、提交选项里的 `runFullTrust` 说明。
7. 保存并提交认证。发布选项保持「认证通过后立即发布」。

提交草稿里这几项都要做完：定价和可用性、属性、年龄分级、程序包、Store 一览。

![提交草稿尚未开始的项目](screenshots/microsoft-store/submission-checklist.png)

### 3.1 定价和可用性

选 **免费**。零售价填 `$ 0` 会被拒，提示「请为价格计划设置有效的价格」。应用完全免费，不要在这里填任何价格。

![零售价填 0 时提示请设置有效的价格](screenshots/microsoft-store/pricing-zero.png)

### 3.2 产品声明

- **不要**勾选生成式 AI。3.1.0 起应用不含任何生成式 AI 功能（`edition.js` 的 `ai: false`），菜单、工具栏、块手柄与右键菜单里都没有 AI 入口，勾了反而与产品不符。
- 应用内没有购买入口、也不在任何地方收款，所以「在应用外购买」一类选项按实际情况取消。
- 取消 Windows 录制 / 直播（那是游戏项，页面上会有黄色提示）。
- 辅助功能和笔输入保持不勾选。

![产品声明页。生成式 AI 不要勾（3.1.0 起应用内无 AI），录制和直播也不要勾](screenshots/microsoft-store/declarations.png)

### 3.3 年龄分级（IARC）

在合作伙伴中心里填问卷，不要去外部机构另拿分级。

- 应用类型：其他所有应用类型。
- 不是实体介质，也不是已有外部分级。
- 各项内容问题选否。
- 购买发生在应用外（邮件），应用里没有商店内购。

![年龄分级从 IARC 问卷开始，不要走实体介质或已有外部分级](screenshots/microsoft-store/iarc.png)

### 3.4 打商店包

在仓库根目录执行。PowerShell 里带 `${version}` 的参数必须加引号，否则会被 PowerShell 先展开，命令到不了 electron-builder。

```powershell
npx electron-builder --win appx '--config.artifactName=ShuiYunYueKeeper.Markdown-${version}.${ext}'
```

产物：`release\ShuiYunYueKeeper.Markdown-3.1.0.appx`。`release/` 不入库。

上传这一个文件。不要上传 `release\MDA-3.0.0-win-x64.appx`（3.0.0 时期用错发布者字符串打出来的旧包）。传错时页面会同时报包系列名不一致、发布者名称无效，并要求先删掉失败的包。

![上传了发布者不匹配的 appx 之后的报错](screenshots/microsoft-store/package-error.png)

### 3.5 签名：商店包保持未签名

`electron-builder` 打出的 appx 本身是**未签名**的，日志写 `AppX is not signed reason=Windows Store only build`。这正是商店要的形态：认证通过后由微软用自己的证书签名（electron-builder 的 AppX 文档原话「Store distribution — no manual signing needed」）。自己签过的包反而会被合作伙伴中心拒——它不接受不是自己加的签名。

**不要**用自签证书给商店包签名。自签证书的根不受信，`signtool verify /pa` 与 `Add-AppxPackage` 都会报 `0x800B0109`（根证书必须是受信任的证书），商店侧同样过不了校验。上传前先确认包里没有签名残留：

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$appx = "D:\mda-l2\release\upload-store-3.1.0\ShuiYunYueKeeper.Markdown-3.1.0.appx"
$z = [System.IO.Compression.ZipFile]::OpenRead($appx)
$z.Entries | Where-Object { $_.FullName -notlike 'app/*' } | Select-Object FullName, Length
$z.Dispose()
```

应当只看到 `AppxManifest.xml`、`AppxBlockMap.xml`、`[Content_Types].xml` 和 4 个 `assets/*.png`；出现 `AppxSignature.p7x` 或 `AppxMetadata/CodeIntegrity.cat` 就说明被 signtool 签过，换回未签名的那份。

自查包结构（清单 schema、文件与 blockmap 是否一致）用 MakeAppx 往返一次即可，报错才是真问题：

```powershell
& "C:\Program Files (x86)\Windows Kits\10\bin\10.0.19041.0\x64\MakeAppx.exe" unpack /p <appx> /d <空目录> /o
& "C:\Program Files (x86)\Windows Kits\10\bin\10.0.19041.0\x64\MakeAppx.exe" pack /d <空目录> /p <新appx> /o
```

只有**本机试装**（排查用，别上传这份）才需要签名，且证书必须装进「受信任的根证书颁发机构」，否则 `Add-AppxPackage` 报 `0x800B0109`：

```powershell
New-SelfSignedCertificate -Type Custom -Subject "CN=E74AF55B-DEC8-4E12-9D-12-FF587E356B53" -KeyUsage DigitalSignature -FriendlyName "MDA local test" -CertStoreLocation "Cert:\CurrentUser\My" -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
Import-Certificate -FilePath <导出的.cer> -CertStoreLocation Cert:\CurrentUser\Root
& "C:\Program Files (x86)\Windows Kits\10\bin\10.0.19041.0\x64\signtool.exe" sign /fd SHA256 /sha1 <指纹> <副本.appx>
Add-AppxPackage -Path <副本.appx>
```

### 3.6 商店一览里要上传的图

桌面应用先上传：

- 一张 **300×300** 方形徽标
- 至少一张桌面截图

Xbox 用的 16:9 主视觉、箱图、9:16 海报和预告片可以留空。

![商店徽标和预告片。桌面应用先交 300×300 方形徽标，预告片可留空](screenshots/microsoft-store/listing-logos.png)

### 3.7 商店文案

中英文各填一套。关键字每条不超过 40 个字符，一共不超过 7 条。

**简体中文**

| 栏目 | 内容 |
|------|------|
| 说明 | 本地优先的 Markdown 工作台，支持打开、预览、轻量编辑、批注与导出。**完全免费**：不含任何 AI 功能，也没有 Pro 或激活码，所有能力直接可用。文档始终留在本机。 |
| 此版本的新增功能 | 首次在 Microsoft Store 发布：完全免费，打开、预览、批注、导出与 Agent（MCP）全部可用。 |
| 短标题 | Markdown工作台 |
| 搜索词 | Markdown、编辑器、批注、预览、笔记 |
| 简短描述 | 本地优先的 Markdown 工作台，支持预览、编辑、批注与导出。完全免费，文档留在本机。 |
| 关键字 | Markdown、编辑器、批注、预览、笔记、本地、写作 |
| 版权和商标信息 | © 2026 MDA |
| 其他许可条款 | 本应用按 MIT 许可证提供。文档归用户所有。 |
| 开发者 | MDA |

**English (United States)**

| Field | Text |
|-------|------|
| Description | Markdown Workbench is a local-first Markdown app for opening, previewing, lightly editing, annotating, and exporting. It is completely free: there are no AI features, no Pro tier, and no activation key. Your files stay on your PC. |
| What's new | First release on the Microsoft Store: completely free, with opening, preview, annotations, export, and Agent (MCP) support available out of the box. |
| Short title | Markdown Workbench |
| Search terms | Markdown, editor, notes, preview, annotation |
| Short description | A local-first Markdown workbench for preview, editing, annotation, and export. Completely free, and your files stay on your PC. |
| Keywords | Markdown, editor, notes, preview, annotation, local, writing |
| Copyright and trademark | © 2026 MDA |
| Additional license terms | This app is provided under the MIT License. Your documents remain yours. |
| Developed by | MDA |

英语（美国）的「说明」不能空着，空着会报「描述不能为空」。搜索词在输入框里逐个输入后按 Enter。

![英语（美国）说明为空时无法保存](screenshots/microsoft-store/listing-en-empty.png)

短标题、搜索词和简短描述在补充字段里。

![短标题、搜索词、简短描述](screenshots/microsoft-store/listing-short.png)

关键字、版权、其他许可条款和开发者在页面更下方。

![关键字、版权和商标、其他许可条款、开发者](screenshots/microsoft-store/listing-keywords.png)

### 3.8 提交选项

发布选项保持第一项：**在此提交通过认证后立即予以发布**。

认证说明客户看不见，可以留空。提交通知收件人填一个能收信的邮箱。

页面检测到 `runFullTrust` 时，红框必须填写。Electron 桌面程序需要这项，商店包才会完整跑起来。

![提交选项。发布选认证后立即发布，红框填写 runFullTrust 的用途](screenshots/microsoft-store/submission-options.png)

贴入：

```
本应用是 Electron 桌面程序（Win32），不是 UWP 沙盒应用。商店 MSIX 包必须声明 runFullTrust，桌面进程才能完整运行。

在产品中的用途：用户自己选择本机文件夹，打开、编辑并保存 Markdown 文件；把粘贴的图片保存到用户指定的本机目录；在本机完成导出。应用不请求管理员权限，不在后台读取其他应用的数据，也不收集遥测。文档留在用户本机。
```

---

## 4. GitHub Release（店外）

店外安装包的打包、令牌、三端上传和检查更新，见 [github-release.md](github-release.md)。商店页不要上传 `.appx` 的那个文件到 GitHub Release。

---

## 5. 问答

**上架商店必须先买代码签名证书吗？**  
商店包不用。微软认证通过后会重新签名。店外 EXE 要减少 SmartScreen 拦截，才需要你自己的证书。

**可以用别的公司的证书签名吗？**  
没有书面授权就不可以。签出来的发布者会显示成那家公司。Mac 打包时若钥匙串里有其他公司的 Developer ID，用 `CSC_IDENTITY_AUTO_DISCOVERY=false` 关掉自动选择。

**`Package "electron" is only allowed in "devDependencies"` 会怎样？**  
这次打包不会产出安装包。`electron` 放在 `devDependencies`。

**个人要填电话或法定姓名吗？**  
商店联系用 mda.markdown@gmail.com。注册页的 ZIP / postal code 填 6 位邮政编码。

**个人开发者账号需要额外资质吗？**  
3.1.0 起应用完全免费，商店与店外都不收款，也没有内购，个人账号按非商业用途登记即可。这不是法律意见。

**名称用了「Markdown工作台」，软著和 GitHub 上的 MDA 还合规吗？**  
软著登记名称是「Markdown工作台软件」。商店显示名与它对齐。GitHub 产物继续叫 MDA，因为 `productName` 是 MDA。商店里「MDA」三个字母被别人占用，不会因此让软著失效。

**上传后提示发布者或包系列名不一致？**  
清单里的 `Publisher` 必须等于合作伙伴中心上的那一串。先删掉失败的包再保存，然后上传 `release\ShuiYunYueKeeper.Markdown-3.1.0.appx`。不要改发布者字符串去凑某一次错误信息里的另一种写法。

**页面说必须签署程序包，但已经打包了？**  
商店提交包**不要**自己签名：`AppxSignature.p7x`、`AppxMetadata/CodeIntegrity.cat` 存在就说明被 signtool 签过，而合作伙伴中心不接受不是它加的签名（自签根不受信，校验报 `0x800B0109`）。重新跑一次 appx 打包，确认 `Get-AuthenticodeSignature` 是 `NotSigned` 再传，并先删掉上一份失败的包。

**上传后一直卡在 `null Bytes` / `Paused`，说包正在处理？**
先排除传输层再怀疑包本身。3.1.0 的 appx 是 114.1 MB（`mermaid` 移到 `devDependencies` 之后，之前 146.7 MB）：本地三项校验都过——`MakeAppx unpack`→`pack` 往返、按 `AppxBlockMap.xml` 逐块重算 SHA256 全匹配、`[Content_Types].xml` 扩展名覆盖全包。若同样的报错重复出现，按顺序试：① 先 Delete 掉 `Paused` 那条，确认没有残留草稿；② 用 Edge/Chrome 无痕窗口、关掉 VPN/代理；③ 从本地磁盘拖入（不要网络盘/OneDrive）；④ 观察上传进度条是否走满 100%，走不满就是浏览器到服务端的传输问题，换网络（手机热点）或换机器最有效；⑤ 仍失败就开工单，附「本地校验通过 + 已删除重传 + 换浏览器/网络」。
**定价填 0 为什么不行？**  
`$ 0` 不是有效价格。选免费。

**英语商店页报描述不能为空？**  
英语（美国）单独有一套文案。把第 3.7 节的英文说明贴进 Description。

**为什么要写 runFullTrust？**  
这是 Electron 全信任桌面程序的受限能力声明。不写说明就无法提交。说明文本见第 3.8 节。

**应用里检查更新仍说找不到 latest.yml？**  
GitHub Release 还是预发布，或资产里没有 `latest.yml`。取消预发布，并确认该文件在 Release 里。当前安装已经是 3.1.0 时，通道正常后会提示已是最新。

**Mac 下载后提示已阻止恶意软件并移到废纸篓？**  
未签名、未公证的隔离应用会被 Gatekeeper 这样处理。本机可以先从废纸篓还原，再执行 `xattr -cr /Applications/MDA.app`。发给别人仍需要你自己的 Apple Developer ID 和公证。

**Mac 启动报 Cannot create BrowserWindow before app is ready？**  
`activate` 早于 `ready` 时不能创建窗口。这个修复在 `src/gui/main.js`：等 `app.whenReady()` 再创建，并且已经有窗口就不再建。打 Mac 包的代码需要包含该提交。
