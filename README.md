# 本地小说写作 App（v2）
可更改软件名
以「桔子写作」为蓝本的极简本地写作工具。**Tauri 2 + Vue 3 + Tiptap + Rust**，一套代码同时打包 Windows exe 与 Android APK。

- 不联网、不登录、不云同步：整个 App 没有任何网络请求
- 正文全部是纯 Markdown（`book.md`），一本一个文件夹，放在你指定的根目录里
- 多书库 + 分卷 / 章节两级目录，分卷和章节都能拖动排序，长按出菜单
- 章节标题行右侧实时显示「本章 N 字 / 全书 N 字」
- 导出可选择 **md / txt / zip**，导入 md、txt 自动还原卷章结构
- 手动存档一键保存，且会顺手清空所有自动存档
- 浅色 / 深色、线格纸、首行缩进、字号行距主色、强制横屏、密码锁，全部可在设置里勾选

---

## 一、需求对照（v2 蓝本逐条）

| # | 需求 | 实现位置 |
|---|---|---|
| 1 | 新建小说项目、分卷章节两级树、上下拖动排序 | `BookPanel.vue`（自研 pointer 拖动，鼠标和触屏都能拖，含跨卷拖动）、`lib/book.ts` 的 `moveVolume / moveChapter` |
| 2 | 左侧隐藏栏分「书籍管理 / 设置」两部分 | 顶栏 `☰` 滑出左侧面板；面板头是「书籍管理」，下面是「设置 / 导入 / 新卷」三个按钮，再接一条分割线，然后是书籍列表；手机端还可以从屏幕左边缘右滑唤出 |
| 2.1 | 书籍管理右上角「＋」新建；长按书名可重命名 / 改顺序 / 删除 | 面板右上角 `＋` 弹输入框建书（自动在根目录建同名文件夹）；长按书名 520ms 弹出底部菜单：重命名书籍、上移一位、下移一位、删除书籍 |
| 2.2 | 设置七个勾选项 | `SettingsSheet.vue` + `lib/settings.ts`：夜晚模式、显示编辑状态栏、默认首行缩进、显示下划线（线格纸）、文件存储根目录、强制横屏、密码保护 |
| 2.3 | 书籍 1 / 书籍 2 点击展开隐藏分卷 | 书籍行点击展开（只展开当前打开的书，点别的书就是切书），分卷行再点可展开 / 收起该卷的章节 |
| 3 | 章节右上角实时统计本章 / 全书字数 | `EditorPane.vue` 的 `.chap-counts`，每次输入即时刷新 |
| 4 | 导出可选 zip / txt / md；导入自动识别 md | 顶栏 `⇪` → 底部菜单三选一；zip 内含整书 md、txt、`book.json`，以及按卷拆分的章节文件 |
| 5 | 字体跟随手机自带 | 默认 `system-ui` 字体栈，另设可选「宋体阅读模式」 |
| 6 | 无云同步 / 无登录 / 无网络；载入导出文件一键分布好卷章 | `parseBook()` 按 `#` 分卷、`##` 分章还原结构；导入时先预览「几卷几章」，确认后落成一本新书 |
| 7 | UI 简洁、可自定义 | 主色 6 选 1、字号 14–26、行距 1.4–2.6、夜晚模式、线格纸、状态栏开关 |
| 8 | 整体手动存档，手动存档后自动存档清空 | 顶栏 `⤓`（或 Ctrl+S）：先落盘再写一份 `manual-*.md`，随后删除该书的全部 `auto-*.md`；自动存档每 10 分钟一次，最多留 5 份 |

---

## 二、先跑起来（3 分钟）

```bash
cd novel-writer
npm install
npm run dev        # 浏览器预览界面（数据存在 localStorage，不是真落盘）
```

确认界面没问题后跑桌面窗口：

```bash
npm run desktop:dev
```

> 浏览器预览只是为了看界面和点流程；真正的文件读写要靠 Rust 端，必须跑 `desktop:dev` 或打包后的 App。

---

## 三、打包 Windows exe

前置：Node ≥ 18、Rust（`rustup` 安装 stable 工具链）、Visual Studio C++ 生成工具、WebView2（Win10/11 自带）。

```bash
cd novel-writer
npm install
npm run desktop:build
```

产物：

```
src-tauri/target/release/bundle/
├─ msi/墨匣_2.0.0_x64_en-US.msi
└─ nsis/墨匣_2.0.0_x64-setup.exe     ← 一般发这个
```

只想试跑不打安装包：`npm run desktop:dev`。
要出免安装绿色版：`src-tauri/target/release/墨匣.exe`。

---

## 四、打包 Android APK

> **注意：这条链路要求 JDK 17。** JDK 11 / 8 会在 Gradle 阶段直接报错。

前置清单：

1. JDK 17（`java -version` 必须显示 17.x）
2. Android Studio（含 SDK Platform 34+、Build-Tools、Platform-Tools）
3. NDK（Android Studio → SDK Manager → NDK Side by side 安装）
4. 环境变量 `JAVA_HOME`、`ANDROID_HOME`、`NDK_HOME` 指向上述目录
5. Rust 的安卓目标：
   ```bash
   rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
   ```

首次初始化（只需一次，会生成 `src-tauri/gen/android`）：

```bash
npm run android:init
```

打 APK / AAB：

```bash
npm run android:build        # 生成 debug APK
npm run android:build:aab    # 生成 Play 商店用的 aab
```

产物位置：

```
src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk
src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab
```

用 Android Studio 调试：`npm run android:dev`。
`tauri.conf.json` 里 `minSdkVersion` 已设为 24（Android 7.0 起）。

---

## 五、数据放在哪

```
<你设置的根目录>/
└─ 长夜将明/                  ← 一本书 = 一个文件夹（文件夹名就是书名）
   ├─ book.md                 ← 唯一的数据源
   └─ .archives/              ← 存档
      ├─ auto-20261109-021500.md
      └─ manual-20261109-023000.md
```

`book.md` 就是普通 Markdown，可以直接用任何编辑器打开：

```markdown
---
title: 长夜将明
author: ''
updated: 2026-11-09T02:30:00.000Z
---

# 第一卷

## 第一章

灯灭了三次，第四次才亮起来。

## 第二章

雪停在子夜。
```

规则：`#` 开头是分卷，`##` 开头是章节，其余都是正文。没有数据库、没有加密、没有私有格式——你把整个根目录拷到另一台设备（或另一个系统），用 App 打开同一个根目录就能接着写。

默认根目录：

- Windows：`文档/墨匣小说`
- 安卓：App 私有文档目录（`/data/data/com.moxia.novel/files/墨匣小说`）

设置里可以改成任意可写目录（安卓端受系统限制，见「已知限制」）。

---

## 六、快捷键

| 键 | 作用 |
|---|---|
| `Ctrl / Cmd + S` | 手动存档（保存 + 清空自动存档） |
| `Ctrl / Cmd + Z` | 撤销（换章会清空撤销栈，不会把上一章的内容撤到本章） |
| `Esc` | 关闭设置面板 |

---

## 七、目录结构

```
novel-writer/
├─ index.html
├─ package.json
├─ vite.config.ts
├─ tsconfig.json
├─ src/
│  ├─ main.ts
│  ├─ App.vue                  ← 外壳：顶栏 / 面板抽屉 / 设置 / 密码锁 / 横屏旋转
│  ├─ styles/main.css          ← 全部样式（CSS 变量集中在 :root，改主色只改一处）
│  ├─ components/
│  │  ├─ BookPanel.vue         ← 左侧隐藏栏：书籍管理 + 设置入口 + 书库树
│  │  ├─ EditorPane.vue        ← Tiptap 编辑器 + 章节标题行双字数 + 状态栏
│  │  ├─ SettingsSheet.vue     ← 七个开关 + 外观 + 存档记录
│  │  ├─ LockScreen.vue        ← 启动密码锁
│  │  └─ ModalHost.vue         ← 输入框 / 确认框 / 长按底部菜单 / toast
│  └─ lib/
│     ├─ md.ts                 ← book.md ⇄ 卷章结构（19 条单测覆盖）
│     ├─ richtext.ts           ← Markdown ⇄ Tiptap JSON
│     ├─ storage.ts            ← 文件读写（Tauri 命令 / 浏览器 localStorage 双实现）
│     ├─ library.ts            ← 多书库：扫描 / 新建 / 改名 / 排序 / 删除 / 导入
│     ├─ book.ts               ← 当前书：打开、保存、存档、导出、结构操作
│     ├─ settings.ts           ← 设置持久化、CSS 变量、密码 SHA-256、横屏判断
│     ├─ ui.ts                 ← 弹窗 / 底部菜单 / toast
│     └─ text.ts               ← uid、去 Markdown、字数统计
└─ src-tauri/
   ├─ src/lib.rs               ← 11 个文件系统命令（见下）
   ├─ tauri.conf.json
   ├─ capabilities/default.json
   └─ icons/                   ← 全套图标（Windows ico / 安卓各密度 / iOS）
```

Rust 端命令：`fs_read_text`、`fs_read_head`、`fs_write_text`、`fs_write_bytes`、`fs_exists`、`fs_mkdir`、`fs_list`、`fs_remove`、`fs_rename`、`default_book_root`、`app_version`。

---

## 八、已知限制（请先看这里）

1. **安卓不能自由选择文件夹**：Android 11+ 的分区存储不开放任意目录写入，App 只能写自己的私有文档目录。所以安卓上的「文件存储根目录」实际是固定位置，设置里能看、能扫描，但不能像 Windows 那样随便选盘符。
2. **密码保护不是读取手机锁屏密码**：任何 App 都拿不到系统锁屏密码。这里的做法是首次开启时让你自己设 4–6 位数字，之后每次启动 App 输入。密码只以 SHA-256（加盐）存在本机 `localStorage`，不上传、可关闭、可重设。
3. **浏览器预览模式不落盘**：`npm run dev` 下文件操作走 localStorage，刷新不丢但也不是真的文件。看真文件请用 `desktop:dev`。
4. **Rust 端未在本机编译验证**：交付环境没有 Rust 工具链（`cargo`），Rust 代码按 Tauri 2 官方 API 写好，但没有本地编译过；首次 `npm run desktop:build` 时若报错，请把错误贴给我，我按报错改。
5. **安卓端未真机验证**：安卓打包链路（JDK 17 / SDK / NDK）按官方文档写，本机没有 Android SDK，同样无法实机验证。
6. 强持横屏是把整个界面旋转 90° 的软实现（不改系统方向），竖屏时自动旋转，横过来后自动恢复。

---

## 九、常见问题

**Q：书打不开 / 列表是空的？**
A：书库只认「目录下含 `book.md` 的子文件夹」。用别的方式建的文件请放进一个独立文件夹，或直接用「导入」。

**Q：换电脑了怎么搬？**
A：把整个根目录（含每本书的文件夹）拷到新电脑的任意位置，在设置里把「文件存储根目录」指过去，点「重新扫描」。

**Q：自动存档会不会占空间？**
A：每 10 分钟一份、最多保留最近 5 份，手动存档后自动全清。单本 60 万字也就每份 1–2 MB 级。

**Q：删错了怎么办？**
A：删除书籍会问你两次；真删掉了，看 `.archives/` 里有没有你之前的存档，或去回收站找（Windows 删除走的是直接删目录，回收站不管用，所以建议删前先手动存档或导出）。

**Q：能改主题色吗？**
A：设置 → 外观 → 主色 6 选 1；想彻底定制改 `src/styles/main.css` 里 `:root` 的 CSS 变量即可。
