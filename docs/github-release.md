# 打包并上传 GitHub Release

店外安装包不进 git。`release/` 已被忽略，`git push` 不会把 EXE 传到远端。用户下载和应用内检查更新，都走 GitHub Release：

<https://github.com/ShuiYunYueKeeper/mda-l2/releases/tag/v3.1.0>

商店用的 `.appx` 是另一条线，见 [microsoft-store.md](microsoft-store.md)。签名、界面语言和 `latest.yml` 的背景见 [packaging-windows.md](packaging-windows.md)。

当前版本是 `3.1.0`（首个完全免费、不含 AI 与 Pro 入口的版本）。发布配置在 `package.json` → `build.publish`：`owner` 为 `ShuiYunYueKeeper`，`repo` 为 `mda-l2`，`releaseType` 已从 `prerelease` 改成 `release`。

下面的截图来自这次实际打包和上传。

---

## 1. 上传哪些文件

Windows 执行 `npm run dist:win` 之后，`release/` 里要传到 Release 的是：

| 文件 | 作用 |
|------|------|
| `latest.yml` | 检查更新的清单。没有它，应用会提示未找到更新清单 |
| `MDA-3.1.0-win-x64.exe` | NSIS 安装包 |
| `MDA-3.1.0-win-x64.exe.blockmap` | 安装包的增量更新数据 |
| `MDA-3.1.0-portable-win-x64.exe` | 便携版 |
| `MDA-3.1.0-win-x64.zip` | 解压即用 |

`release/win-unpacked/` 是打包中间目录，不要整夹上传。`release/pkg/` 只是目录被占用时的临时输出，和正式文件重复时不要再传一份。商店包 `ShuiYunYueKeeper.Markdown-3.1.0.appx` 不放到这个 Release 里。

Mac、Linux 的安装包文件名遵循 `MDA-<版本>-<系统>-<架构>.<ext>`。通用 Mac 包是 `MDA-3.1.0-mac-universal.dmg`。打完后以上传 `release/` 里实际生成的安装包、对应 `.blockmap` 和 yml 为准。

---

## 2. 打包前

1. 关掉所有 MDA 窗口。已打开的实例占着单实例锁，也会锁住 `release/win-unpacked`。
2. 在**即将执行打包或发布命令的那个终端**里准备令牌。换一个窗口要重新设置。
3. 该机器已执行过 `npm install`。`electron` 必须在 `devDependencies`，否则 electron-builder 直接拒绝打包。

![electron 放在 dependencies 时打包被拒绝](screenshots/github-release/electron-devdep.png)

令牌用 GitHub classic PAT，范围勾 `repo`。生成时 Note 不能空，填 `mda-release`。令牌不要写进仓库、不要提交。

![新建 classic PAT 时 Note 为空会报 Note can't be blank](screenshots/github-release/pat-note.png)

Windows PowerShell：

```powershell
$env:GH_TOKEN = "ghp_..."
```

macOS / Linux：

```bash
export GH_TOKEN="ghp_..."
```

只打包、稍后在网页上手工上传时，可以先不设 `GH_TOKEN`。

---

## 3. Windows

在仓库根目录：

```powershell
npm run dist:win
```

这条命令会先编译，再清掉旧的 `release/win-unpacked`，然后打出 NSIS、便携版、zip 和 `latest.yml`。结束时 `scripts/verify-release.js` 检查 `MDA.exe` 和 Electron 运行时文件是否都在。日志里应能看到 `updater meta: latest.yml`。若只有警告「未找到 latest.yml」，检查更新不可用。

`win-unpacked` 删不掉（`EPERM` / `EBUSY`）时，先确认没有 `MDA.exe`，再关掉占用该目录的进程。仍删不掉时，可以改输出目录打一份，再从该目录取文件：

```powershell
npx electron-builder --win "--config.directories.output=release/pkg"
```

PowerShell 里这个参数必须整体加引号。

### 发 v3.1.0（新 Release，自动上传）

`package.json` 的 `version` 已是 `3.1.0`，`build.publish.releaseType` 已是 `release`。这是一个**新** Release，没有「发布超过 2 小时」的限制，可以直接让 electron-builder 建 Release 并上传。

```powershell
$env:GH_TOKEN = "ghp_..."
npx electron-builder --win --publish always
```

安装包已经打好（`npm run dist:win` 跑过）、只想上传时：

```powershell
$env:GH_TOKEN = "ghp_..."
npx electron-builder --prepackaged release/win-unpacked --win --publish always
```

没有令牌时，把第 1 节列出的文件手工拖到新建的 Release 编辑页：

<https://github.com/ShuiYunYueKeeper/mda-l2/releases/new>

标签填 `v3.1.0`（与 `package.json` 的 `version` 一致），标题 `MDA 3.1.0`，**不要**勾 Set as a pre-release。

版本 `3.1.0` 不含 `alpha` / `beta` / `rc`，更新器走稳定通道，请求的地址是：

`https://github.com/ShuiYunYueKeeper/mda-l2/releases/latest/download/latest.yml`

资产里缺 `latest.yml`、或 Release 被标成预发布时，这个地址会 404，应用提示「未找到更新清单 (latest.yml)」。通道正常后，已安装 3.0.0 的用户点检查更新会看到 3.1.0。

![已安装的 3.0.0 检查更新时找不到 latest.yml](screenshots/github-release/latest-yml-missing.png)

### 以后发新版本

1. 修改 `package.json` 的 `version`。
2. 确认 `build.publish.releaseType` 是 `release`（保持 `prerelease` 时，稳定版检查更新找不到 `latest.yml`）。
3. 在同一个终端设置 `GH_TOKEN`，执行 `npm run dist:win`。若要构建完立刻发布，用上面的 `--publish always`。
4. 打开 Release 页面，确认资产里有 `latest.yml` 和安装包，并且没有勾预发布。

---

## 4. macOS

在 Mac 上打包。打包前在同一终端关掉自动签名，避免钥匙串里其他公司的 Developer ID 被选中：

```bash
export CSC_IDENTITY_AUTO_DISCOVERY=false
export GH_TOKEN="ghp_..."
npm run dist:mac
```

只要一个通用包：

```bash
export CSC_IDENTITY_AUTO_DISCOVERY=false
npx electron-builder --mac --universal
```

日志里应出现跳过 macOS 签名（`skipped macOS application code signing`）。若出现 `identityName=Developer ID Application: ...`，这个包装的是别人的证书，不要上传。

![自动选中了其他公司的 Developer ID，这个包不能上传](screenshots/github-release/mac-signed-kingsoft.png)

空的 `codesign` 查询不能用来判断有没有签名，以 electron-builder 日志里的 `identityName=` 或 `skipped macOS application code signing` 为准。

v3.0.0 的 Release 已超过 2 小时，上传会被跳过。把 dmg（以及生成的 zip、blockmap）拖到 Release 编辑页。不要加 `--publish always`。

![签名已经跳过，但因为 Release 发布超过 2 小时，GitHub 上传被跳过](screenshots/github-release/mac-publish-skipped.png)

打进包里的代码需要包含 macOS 冷启动修复：`activate` 早于 `ready` 时不能创建窗口。未包含时，启动会报 `Cannot create BrowserWindow before app is ready`。

![未包含冷启动修复时，打开应用会弹出这个对话框](screenshots/github-release/mac-browserwindow.png)

未签名、未公证的 dmg 从浏览器下载后，系统可能提示已阻止恶意软件并移到废纸篓。本机可从废纸篓还原后执行 `xattr -cr /Applications/MDA.app` 再打开。发给别人需要你自己的 Apple Developer ID 和公证。

![未公证的 MDA.app 被系统拦截并移到废纸篓](screenshots/github-release/mac-gatekeeper.png)

---

## 5. Linux

在 Linux 或 WSL 里打包。先安装依赖，否则 `scripts/generate-gui-icons.js` 会报 `Cannot find module 'lucide'`。

![依赖没装全时，图标脚本找不到 lucide](screenshots/github-release/linux-lucide.png)

```bash
npm install
export GH_TOKEN="ghp_..."
npm run dist:linux
```

Windows 上打 AppImage 会失败：先是图标符号链接 `EPERM`，换到管理员终端后又会找不到 `darwin\mksquashfs`。

![Windows 上创建 AppImage 图标符号链接被拒绝](screenshots/github-release/appimage-symlink.png)

![改用管理员终端后，仍然找不到 macOS 版的 mksquashfs](screenshots/github-release/appimage-mksquashfs.png)

在 Windows 上只需要 deb 时：

```powershell
npx electron-builder --linux deb
```

AppImage 和 deb 的完整一套在 Linux 上打。已有 Release 同样在网页上手工上传，不要用 `--publish always`。

---

## 6. 问答

**安装包要提交进 git 吗？**  
不要。`release/` 不入库。远端只放 GitHub Release 上的附件。

**`GH_TOKEN is not set`？**  
发布命令和 `$env:GH_TOKEN` / `export` 必须在同一个终端。另一个窗口里设过的变量，这里看不见。

**PAT 的 Note 填什么？**  
`mda-release`。范围勾 `repo`。

**electron-builder 说 electron 只能放在 devDependencies？**  
这次没有产出安装包。确认 `electron` 在 `devDependencies` 后重新 `npm install`，再打包。

**`pre-dist` 删除 `win-unpacked` 报 EPERM？**  
先退出所有 MDA 窗口。目录仍被占用时，用第 3 节的 `release/pkg` 输出目录重打，只上传那一份产物。

**为什么检查更新仍说找不到 latest.yml？**  
Release 还是预发布，或资产里没有 `latest.yml`。取消 **Set as a pre-release**，并确认清单和它指向的 exe 都在。只上传源码 zip 或只拖 exe、不带 yml，检查更新都会失败。

**上传被跳过，说 existing release published more than 2 hours ago？**  
electron-builder 不肯改太旧的 Release。到网页编辑页手工上传。这不是打包失败。

**`--publish always` 之后更新又坏了？**  
`releaseType` 被改回 `prerelease` 时，这个参数会把 Release 重新标成预发布，`/releases/latest` 再次 404。确认 `package.json` 的 `build.publish.releaseType` 是 `release`；若 Release 已被标成预发布，到网页上取消。

**Mac 日志里有珠海金山的 Developer ID？**  
那是签过名的，而且签的是别的公司。不要上传。同一终端先 `export CSC_IDENTITY_AUTO_DISCOVERY=false` 再打包。

**Windows 上打 Linux 包失败？**  
AppImage 不要在 Windows 上打。deb 可以用上面的 `--linux deb`。完整的 AppImage 放到 Linux 里，先 `npm install`。

**当前已经装了 3.0.0，发布 3.1.0 后会怎样？**  
清单能下载之后，检查更新会提示有 3.1.0；3.0.0 那个旧 Release 保持原样即可，也可以之后标成历史版本。
