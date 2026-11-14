# Knowex

Knowex 是一款面向科研阅读的 Windows 优先、本地优先桌面应用。它可以阅读 PDF 和静态转换后的 PPT/PPTX，将页面中的关键证据保存为截图、文字批注、页面标签和 Markdown 笔记，并支持围绕当前证据进行可选的 AI 问答与 Exa 学术检索。

Knowex 聚焦一条明确的研究阅读流程：

> 阅读文献 → 标记页面证据 → 记录理解与问题 → 可选地询问 AI 或检索来源 → 保存为可迁移的本地记录

Knowex 不替代 Zotero，不自动上传整篇文档，不执行 OCR，也不构建云端知识库或 RAG 系统。源文档不会因批注而被修改，工作区中的 Markdown 和 PNG 文件才是用户可直接管理、备份与迁移的阅读成果。

## 核心亮点

### 页面证据与笔记绑定

每条记录都会保留文档、页码或幻灯片、页面位置和批注内容，减少笔记脱离上下文的问题。支持：

- 框选页面区域并保存原始 PNG；
- 选中文字后创建高亮或下划线；
- 在页面任意位置放置页面标签；
- 编辑标题、批注、颜色和标签；
- 将针对当前证据的 AI 对话写入同一份 Markdown 记录。

批注坐标采用页面归一化数据。改变缩放比例、渲染分辨率或阅读模式时，批注锚点仍能保持稳定。

### 本地优先、格式开放

- Markdown 笔记可直接阅读、编辑、版本管理或导入其他工具；
- 截图以独立 PNG 文件保存，并通过相对路径嵌入 Markdown；
- JSON 索引管理文档、批注和回收站状态；
- 工作区可以直接复制、备份和迁移；
- 索引和笔记采用临时文件加原子替换，降低写入中断造成损坏的风险。

### AI 只处理用户明确提交的证据

文字问答可以发送选中文字、页码、个人批注、当前问题和当前批注的对话历史。截图问答还可以发送当前截图以及用户明确附加的 PNG 图片。

Knowex 不会自动发送整篇 PDF、其他工作区文件、Zotero 数据库或 API Key。模型列表读取、文本能力测试和图片能力测试彼此独立，不会在后台自动试探所有候选模型。

当前支持的 AI 连接包括：

- OpenAI Responses API；
- Anthropic Messages API；
- DeepSeek、Kimi、MiniMax、GLM/智谱等 OpenAI Chat Completions 兼容接口；
- 自定义 OpenAI-compatible 接口；
- 本地 Codex CLI；
- 本地 Claude Code CLI。

云端 API Key 由 Electron `safeStorage` 在主进程中加密保存。本地 CLI 的登录状态由对应工具自行管理，Knowex 不读取、复制或保存 CLI Token。

设置界面只显示连接名称、模型、已配置状态、配置更新时间和脱敏测试结果，不回显 API Key。时间与测试记录用于帮助用户确认配置是否真正留存，不包含密钥或完整服务商响应。

### Zotero 作为文献入口

Knowex 通过 Zotero Desktop Local API 读取已下载的 PDF 附件，并保留 Zotero 的集合层级。打开附件时可以选择：

- 导入 Zotero 中已有的笔记和 PDF 批注；
- 将 Knowex 批注导出为 Zotero 条目下的一个子笔记。

Local API 仅用于读取。导出是需要用户明确确认的独立写操作，通过 Zotero Web API 完成，并需要用户 ID 和具有个人库写权限的专用 API Key。Knowex 不直接访问 `zotero.sqlite`。

### 独立的 Exa 学术检索

Exa 是与 AI 连接注册表分离的网页检索模块，默认使用学术优先模式：

- 优先检索论文、预印本和学术出版物；
- 选中文字或框选区域后，可从证据快捷栏直接进入 Exa、AI、翻译或复制；
- 已有批注中的个人学习笔记、Exa 检索和 AI 问答采用三个可折叠层级；
- Exa 支持起止年份、文献语言偏好和结果数量筛选；
- 返回 5、8 或 10 条结果，并把查询相关 highlights 独立显示为“原文引用”；
- 可以使用系统浏览器打开原文；
- 可以按需抓取适合阅读的 Markdown 正文。

Exa 只会在用户确认搜索、抓取正文或测试连接时发送请求，不会因右键、展开面板或输入文字而自动搜索。语言筛选是语义偏好而非严格过滤；检索结果和抓取正文只在当前窗口暂存，不写入工作区，也不会自动发送给 AI 总结。

## 基本功能

### 文档阅读

- 使用 PDF.js 阅读 PDF；
- 打开 PDF、PPT 和 PPTX；
- PPT/PPTX 通过本机 LibreOffice 转换为 PDF 后阅读；
- 分页阅读与连续滚动；
- `Ctrl + 鼠标滚轮` 或触控板捏合缩放；
- 实际大小、适应宽度、适应高度；
- 横向或纵向分栏阅读；
- 原色、米色和深色页面主题；
- 缩略图、PDF 目录、批注列表和全文模糊搜索；
- 当前页朗读或从选中文字开始朗读；
- 阅读器右键菜单及常用键盘操作。

### 批注与证据记录

- 框选截图，并在保存前确认或取消；
- 八种颜色的文字高亮和下划线；
- 支持连续标注的锁定工具模式；
- 页面任意位置的页面标签；
- 标题、正文批注、颜色和标签编辑；
- 切换批注或关闭编辑器时自动保存草稿；
- 删除后保留 30 天的批注回收站；
- 恢复、永久删除和到期自动清理；
- 批注变化后自动更新对应 Markdown；
- 可配置全局页面框选快捷键和退出时临时文件清理。

### 文献库与检索

- 本地最近文档列表；
- Zotero PDF 附件读取和集合树展示；
- Zotero 元数据、笔记和批注导入；
- 经确认后向 Zotero 写入一个可持续更新的子笔记；
- 证据快捷栏，以及批注内可折叠的个人笔记、Exa 检索和 AI 问答工作区。

### 首次引导与界面

- 首次启动只完成必要设置：选择本地工作区、了解核心阅读方式、确认截屏快捷键；
- Zotero、AI 和 Exa 等可选能力延后到用户第一次使用对应功能时配置；
- 可从 **帮助 → 开始使用** 再次打开上手指南；
- 顶部只保留“打开文件、研究、框选区域”三个主要文字入口，Zotero、Exa 和显式写回统一收纳在“研究”菜单中；
- 阅读主题、分页/连续模式和横向/纵向分屏统一收纳在阅读外观菜单中，常用的缩放与批注工具保持直接可用；
- 选中文字或框选证据后，复制、Exa、AI 和翻译使用同一组快捷操作；批注中的个人笔记、Exa 与 AI 以独立折叠模块组织；
- 阅读器和批注记录提供适合对象的右键快捷操作，删除等关键动作仍保留可见入口；
- 设置按“通用、AI 连接、Exa 搜索、Zotero”分类显示，避免不同作用域的选项混在同一长表单中；
- API 凭据保存后会显示已配置状态和上次更新时间；AI 与 Exa 还会保留最近一次脱敏连接测试记录；
- 支持中文和英文界面；
- 可调整宽度的三栏桌面布局；
- 可查看工作区、Markdown、临时目录和当前笔记的本地路径。

## 首次配置与启动

### 必需环境

- Windows 10 或更高版本；
- Node.js 22 或更高版本；
- npm；
- 首次安装依赖时可访问 npm 软件源的网络连接。

LibreOffice、Zotero、AI 和 Exa 都是可选功能，不需要在第一次启动前全部配置。

### 代码命令：首次配置

在项目根目录打开 PowerShell：

```powershell
npm run setup
npm run dev
```

`npm run setup` 会检查 Node.js，安装或增量更新依赖，检查并修复 Electron 运行时，然后报告 LibreOffice、Zotero、Codex CLI 和 Claude Code CLI 等可选集成的状态。

以后需要重新诊断环境时运行：

```powershell
npm run doctor
```

诊断结果中：

- `[OK]` 表示功能可用；
- `[--]` 表示可选功能尚未配置；
- `[!!]` 表示存在会阻止开发版启动的问题。

诊断命令不会安装外部软件、修改应用设置或发送真实 AI 请求。

### 应用内首次设置

1. 首次启动时点击 **选择工作区**，指定一个专门保存 Knowex 数据的文件夹；未完成该步骤前，界面不会引导用户执行必然失败的打开操作。
2. 完成三步上手引导；Zotero、AI 和 Exa 均可跳过并在需要时再配置。
3. 使用 **打开文件** 打开一个普通 PDF。
4. 创建一条截图或文字批注。
5. 确认工作区中已经生成 Markdown，以及对应的 PNG 截图。
6. 根据实际需要再配置 LibreOffice、Zotero、AI 或 Exa。

不建议将源码目录、系统目录、Zotero 数据目录或临时下载目录设为工作区。源码依赖和用户数据具有不同的生命周期，应分开存放。

### 可选功能配置

| 功能 | 额外准备 | 未配置时的影响 |
| --- | --- | --- |
| PDF 阅读与本地批注 | 无 | 核心功能可正常使用 |
| PPT/PPTX | 安装 LibreOffice，并能在默认目录或 `PATH` 中找到 `soffice.exe` | 无法导入演示文稿 |
| Zotero 读取 | 运行 Zotero Desktop，并开启 Local API | 无法从 Zotero 选择附件 |
| Zotero 写回 | Zotero 用户 ID 和具有个人库写权限的 Web API Key | 仍可只读导入，但不能导出子笔记 |
| 云端 AI | 对应服务商的 API Key、可用模型和网络 | 无法进行 AI 问答，不影响本地阅读 |
| 本地 AI | 已安装并登录的 Codex CLI 或 Claude Code CLI，且可选择直接 `.exe` | 无法使用本地 CLI 问答 |
| Exa | Exa API Key 和可用额度 | 无法进行学术网页检索和正文抓取 |

## 使用流程

1. 选择本地工作区，打开空文件夹或已有 Knowex 工作区。
2. 使用 **打开文件** 打开 PDF、PPT 或 PPTX；也可以从 **研究 → 从 Zotero 打开** 选择附件。
3. 使用 **框选区域** 保存页面截图，或选择 PDF 文字创建高亮和下划线。
4. 选中文字或完成框选后，可以直接选择 **复制、用 Exa 检索、询问 AI、翻译**；Knowex 会先保存证据，再打开右侧对应模块。
5. 在右侧批注中按需展开 **个人学习笔记、Exa 文献检索、AI 问答与翻译**，不需要在多个独立窗口之间重复搬运上下文。
6. 在个人学习笔记中填写标题、批注、颜色和标签；AI 对话会保存到同一条 Markdown 记录。
7. 可选：在 **设置 → Exa 搜索** 中保存 Exa Key，再从“研究”菜单或当前证据进入检索。

缩放时使用 `Ctrl + 鼠标滚轮` 或触控板捏合。普通滚轮和触控板滚动保留给连续阅读。

常用键盘操作包括：

- `H`：进入或退出高亮锁定模式；
- `U`：进入或退出下划线锁定模式；
- `Page Up` / `Page Down`：翻页；
- `Esc`：退出当前工具或停止朗读。

## 外部集成

### Zotero

1. 启动 Zotero Desktop 并保持运行。
2. 打开 **编辑 → 设置 → 高级**。
3. 开启 **允许本机其他应用程序与 Zotero 通信**。
4. 返回 Knowex，选择 **Zotero → 重新检测**。

Knowex 通过 `http://localhost:23119/api/` 检查 Zotero Local API。`403 Forbidden` 通常表示尚未开启本机通信。

开启自动刷新后，Knowex 在应用可见时每 20 秒检查一次 Local API。打开附件会把 PDF 副本放入 Knowex 工作区，并在对应的 Zotero 集合路径下生成 Markdown。该过程不会修改 Zotero Connector，也不会直接写入 Zotero 数据库。

### AI 连接

建议按照以下顺序配置：

1. 选择提供商、协议、区域、接口地址和模型。
2. 保存连接。
3. 执行文本能力测试。
4. 需要截图问答时，再执行独立的图片能力测试。
5. 在某条截图或文字批注中提问。

远程自定义接口必须使用 HTTPS；只有明确的本地兼容服务可以使用 localhost HTTP。不要把 API Key 写入 URL 查询参数，也不要将不可信的中转地址当作官方提供商地址。

### Exa 学术搜索

1. 在 Exa Dashboard 创建 API Key。
2. 打开 **设置 → Exa 搜索**。
3. 保存 API Key。
4. 可选：执行连接测试。该测试会进行一次真实搜索，可能消耗 Exa 用量。
5. 使用顶部 **研究 → Exa 学术检索**，或从当前文字/截图证据的快捷操作进入检索。

选中 PDF 文字后，浮动快捷栏和右键菜单都会提供 Exa、AI、翻译和复制。框选页面区域后也会出现同组快捷操作；选择 Exa、AI 或翻译时，Knowex 会先保存当前证据并打开右侧批注中的对应折叠区。已有批注可以直接展开“Exa 文献检索”，输入研究问题并按 Enter 搜索；年份、语言偏好和结果数量位于“详细筛选”。

详细说明见 [docs/EXA_SEARCH.zh-CN.md](docs/EXA_SEARCH.zh-CN.md)。

## 数据目录

### 数据结构：Knowex 工作区

```text
Workspace/
├─ assets/regions/YYYY-MM-DD/<asset-id>.png
├─ notes/<document-id>.md
├─ notes/Zotero/<collection path>/<document-id>.md
└─ .knowex/
   ├─ index.json
   ├─ imports/*.pdf
   └─ tmp/
```

- `notes/`：面向用户的 Markdown 笔记；
- `assets/regions/`：截图证据；
- `.knowex/index.json`：可重建的本地索引和回收站元数据；
- `.knowex/imports/`：从 Zotero 导入的 PDF 副本，以及演示文稿的转换结果；
- `.knowex/tmp/`：截图等临时文件的原子写入暂存区。

Exa Key 不保存在工作区中。它使用 `safeStorage` 加密后单独写入 Electron 应用配置目录下的 `exa.json`。

## 注意事项

### 数据与隐私

- Knowex 不修改源 PDF，也不会把批注写回 PDF 内嵌注释；
- 截图可能包含敏感研究内容，备份或同步工作区时应按同等敏感级别处理；
- API Key 虽由系统安全存储保护，但无法防御同一用户权限下的恶意进程；
- 自定义 AI 中转服务可以看到发送给它的 Key、批注、问题和图片；
- Exa 会收到用户主动提交的研究问题、当前文字证据、筛选条件或来源 URL；框选图片本身不会发送给 Exa；
- Exa 抓取内容当前只在窗口中暂存，不写入工作区，也不发送给 AI；
- `.knowex/tmp/` 是临时目录，不应作为长期备份来源；
- 永久删除或 30 天到期清理会同时删除关联截图。

### 外部依赖

- PPT/PPTX 转换依赖 LibreOffice；
- Zotero 集成依赖 Zotero Desktop 正在运行并允许本机通信；
- 云端 AI 依赖账户权限、余额、区域、模型和服务商状态；
- AI 的“已配置”仅表示本地设置完整，不代表接口一定可用；
- Exa 搜索、连接测试和正文抓取都可能消耗 Exa 用量；
- Windows 本地 CLI 当前要求直接指向 `.exe`，`.cmd`、`.bat` 和 `.ps1` 启动脚本会被拒绝；
- 本地 CLI 当前按文本能力处理，不会自动接收截图图片。

### 当前产品边界

当前版本明确不包含：

- OCR；
- 整篇文档自动上传；
- RAG、向量索引或云端知识库；
- 云端账号、协作或同步服务；
- 直接写入 Zotero 数据库；
- PDF 原生批注的完整导入、编辑和写回；
- Exa 结果持久化、自动 AI 总结、Deep Search、Agent、Monitors 或后台搜索；
- EPUB、网页存档、自由绘图、可编辑文本框等完整阅读器兼容能力。

## 开发与构建

### 代码命令：检查、构建和打包

```powershell
npm run typecheck
npm run test
npm run build
npm run package:win
```

Windows 安装包输出到 `release/`。当前技术栈包括 Electron、React、TypeScript、Vite、PDF.js、Zod 和 Vitest。

安装版暂不包含在线自动更新器。升级安装版时，需要下载新安装包并覆盖安装；应用设置和单独选择的工作区会继续保留。

源码更新后，仅当 `package.json` 或 `package-lock.json` 变化时才需要重新执行 `npm run setup` 或 `npm install`。仅代码变化时可以直接执行 `npm run dev`。

## 代码框架

### 代码依赖方向

```text
React 功能界面
  -> 应用级 hooks
  -> 类型化 window.knowex API
  -> context-isolated preload bridge
  -> 经过信任检查和 Schema 校验的 IPC handlers
  -> 主进程服务与外部适配器
  -> 本地文件 / LibreOffice / Zotero API / AI endpoint / Exa API

共享领域模型与 IPC 契约
  -> 可被各层导入
  -> 不得依赖 React、Electron 或 Node.js API
```

渲染进程不能直接访问文件系统、凭据、Zotero、LibreOffice 或子进程。所有高权限能力都通过窄化、类型化并经过校验的 IPC 交给主进程。

### 代码目录结构

```text
Knowex/
├─ src/
│  ├─ main/
│  │  ├─ ai/             # AI 连接、Prompt、端点策略、云端与 CLI 适配器
│  │  ├─ assets/         # 截图资产和批注应用服务
│  │  ├─ clipboard/      # 系统剪贴板图片监听
│  │  ├─ document/       # 文档导入和 LibreOffice 演示文稿转换
│  │  ├─ exa/            # Exa 检索、正文抓取和独立加密设置
│  │  ├─ ipc/            # 按领域拆分的可信 IPC handlers
│  │  ├─ menu/           # 原生菜单与渲染器命令
│  │  ├─ notes/          # Markdown 投影
│  │  ├─ shortcuts/      # 全局截图快捷键生命周期
│  │  ├─ storage/        # 配置、凭据、工作区索引和维护
│  │  └─ zotero/         # Local API、数据映射、导入和 Web API 导出
│  ├─ preload/           # 最小化 contextBridge，不承载业务逻辑
│  ├─ renderer/src/
│  │  ├─ app/            # 界面组合和应用级 hooks
│  │  ├─ components/     # 可复用布局、动作菜单和右键菜单
│  │  ├─ features/       # 阅读器、批注、证据工作流、截图、聊天、Exa、文献库和设置
│  │  ├─ i18n/           # 中英文类型化词典和语言状态
│  │  └─ styles/         # 基础、外壳、阅读器、批注和对话框样式
│  └─ shared/
│     ├─ contracts/      # IPC 通道、Zod Schema 和公开 API
│     └─ domain/         # 文档、批注、工作区、设置、Zotero 和 Exa 实体
├─ scripts/
│  ├─ setup.mjs                     # 首次配置编排
│  ├─ check-environment.mjs         # 只读环境诊断
│  ├─ environment-utils.mjs         # 统一路径、命令与 npm 检测规则
│  └─ ensure-electron-runtime.mjs   # Electron 安装和注册修复
├─ docs/                  # 架构、开发、能力、安全和审计文档
├─ resources/             # 打包资源和非私密测试资产
└─ package.json           # 开发、验证、构建和 Windows 打包命令
```

### 核心模块关系

- `src/main/app-services.ts` 负责创建长期服务；IPC 注册器只做信任检查、输入校验和委派。
- `src/renderer/src/app/App.tsx` 负责界面组合；文档流程、Zotero 状态和通知由应用级 hooks 管理。
- `src/renderer/src/features/reader/` 负责 PDF 渲染、视口、导航、搜索和阅读工具。
- `src/renderer/src/features/research/` 只定义证据快捷操作与工作流意图；Exa、AI 和持久化仍由各自模块处理。
- `src/renderer/src/features/annotations/` 将个人笔记、Exa 和 AI 组合为可折叠工作区，但三个功能保持独立状态和服务边界。
- `src/main/assets/`、`src/main/notes/` 与 `src/main/storage/` 共同完成批注、PNG、Markdown 和索引持久化。
- `src/main/ai/` 通过 Provider Registry 和不同 connector 隔离云端协议与本地 CLI。
- `src/main/exa/` 是独立检索边界，不进入 AI Provider Registry；其他模块只使用经过映射的公开来源 DTO。
- `src/main/zotero/` 将 HTTP、纯数据映射、导入流程和显式写回拆分为独立职责。
- `scripts/environment-utils.mjs` 是维护脚本的统一环境规则来源，避免配置、诊断和 Electron 修复产生版本分叉。

### 兼容性约束

- 工作区路径使用相对路径，索引和 Markdown 修改采用原子替换；
- 已有 JSON、Markdown 和设置格式必须保持可读，结构变化需要版本化迁移；
- 不同提供商、平台和版本差异应放入适配器、能力检测或迁移层；
- 页面坐标始终保持归一化，缩放和 Canvas 分辨率不能改变批注锚点；
- Exa、AI 和 Zotero 各自保持独立凭据、协议和错误边界。

更详细的实现契约见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，结构审计见 [docs/STRUCTURE_AUDIT.md](docs/STRUCTURE_AUDIT.md)。

## 相关文档

- [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)：首次使用指南；
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：模块边界、依赖方向和数据契约；
- [docs/AI_CONNECTIONS.md](docs/AI_CONNECTIONS.md)：AI 连接、端点、密钥和 CLI 规则；
- [docs/EXA_SEARCH.zh-CN.md](docs/EXA_SEARCH.zh-CN.md)：Exa 配置、搜索建议、计费提示和限制；
- [docs/READER_CAPABILITIES.md](docs/READER_CAPABILITIES.md)：阅读器能力与兼容性边界；
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)：开发和调试；
- [docs/audits/2026-08-18-ui-ux-baseline.md](docs/audits/2026-08-18-ui-ux-baseline.md)：本轮界面与关键路径优化基线；
- [SECURITY.md](SECURITY.md)：安全要求；
- [CONTRIBUTING.md](CONTRIBUTING.md)：贡献规范。

## 项目状态

Knowex 当前源码版本为 **0.7.0**，仍处于早期内部测试阶段。PDF 阅读、页面证据捕捉、本地批注和 Markdown 持久化是主要路径。PPT 转换、Zotero、AI 和 Exa 分别依赖本机软件、外部服务或用户配置；不可用时应显示明确错误，而不影响不相关的核心功能。

欢迎在明确的 MVP 范围内提交问题和改进。涉及 OCR、RAG、云同步、协作、Exa 持久化或扩大 Zotero 写回范围的修改，请先提出产品方案。

## 许可证

[MIT](LICENSE)
