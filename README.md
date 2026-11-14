# Knowex（网页端 / Web Edition）

Knowex 是一款面向科研阅读的本地优先文献阅读与证据管理网页应用（由 Knowex 桌面端代码库适配至浏览器 + Node.js/Express Web 服务）。它可以阅读 PDF 和静态转换后的 PPT/PPTX，将页面中的关键证据保存为截图、文字批注、页面标签和 Markdown 笔记，并支持围绕当前证据进行可选的 AI 问答与 Exa 学术检索。

Knowex 聚焦一条明确的研究阅读流程：

> 阅读文献 → 标记页面证据 → 记录理解与问题 → 可选地询问 AI 或检索来源 → 保存并导出可迁移的 Markdown 记录

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

云端 API Key 由服务端使用 AES-256-GCM（`NodeSecretVault` + `.knowex-data/master.key` 或环境变量 `KNOWEX_ENCRYPTION_KEY`）加密保存，绝不回传到浏览器端。本地 CLI 的登录状态由对应工具自行管理，Knowex 不读取、复制或保存 CLI Token。

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

- 首次启动自动初始化 `default` 服务端工作区与内置示例文献（支持随时通过工作区选择器创建或切换工作区），并保留“本地阅读、批注记录、快捷键与剪贴板粘贴”三步上手引导（也支持 `?autostart=1` 直达主界面）；
- Zotero、AI 和 Exa 等可选能力延后到用户第一次使用对应功能时配置；
- 可从 **工具 → 使用指南** 再次打开上手指南；
- 顶部只保留“打开文件、研究、工具、框选区域”四个主要文字入口，Zotero、Exa 和显式写回统一收纳在“研究”菜单中，Markdown 笔记预览导出、目录路径、30 天回收站、工作区切换和指南统一收纳在“工具”菜单中；
- 支持浏览器文件上传、拖拽 PDF/PPT/PPTX 至阅读区、内置示例文献一键打开，以及 `Ctrl+V / Cmd+V` 粘贴剪贴板截图到聊天栏；
- 阅读主题、分页/连续模式和横向/纵向分屏统一收纳在阅读外观菜单中，常用的缩放与批注工具保持直接可用；
- 选中文字或框选证据后，复制、Exa、AI 和翻译使用同一组快捷操作；批注中的个人笔记、Exa 与 AI 以独立折叠模块组织；
- 阅读器和批注记录提供适合对象的右键快捷操作，删除等关键动作仍保留可见入口与应用内确认弹窗；
- 设置按“通用、AI 连接、Exa 搜索、Zotero”分类显示，避免不同作用域的选项混在同一长表单中；
- API 凭据保存后会显示已配置状态和上次更新时间；AI 与 Exa 还会保留最近一次脱敏连接测试记录；
- 支持中文和英文界面；
- 可调整宽度的三栏网页端布局；
- 可预览、复制、下载当前文献 `.md` 或导出全部工作区笔记包。

## 首次配置与启动

### 必需环境

- Node.js 22 或更高版本；
- npm；
- 现代桌面浏览器（Chrome / Edge / Firefox / Safari）。

LibreOffice、Zotero、AI 和 Exa 都是可选功能，不需要在第一次启动前全部配置。

### 代码命令：启动网页端服务

在项目根目录执行：

```bash
npm install
npm run dev
```

开发模式会在 `http://0.0.0.0:3000` 启动 Express API 服务与 Vite SPA 中间件；如需构建生产产物并启动：

```bash
npm run build
npm start
```

可选环境变量见 `.env.example`（`KNOWEX_DATA_DIR` 默认 `.knowex-data`，`KNOWEX_ENCRYPTION_KEY` 用于覆盖自动生成的加密主密钥）。

### 应用内首次使用

1. 打开浏览器访问服务地址，服务端已自动创建 `default` 工作区并预置一份可交互的示例 PDF；也可点击右上角工作区标识随时切换或新建隔离工作区。
2. 阅读或跳过三步上手引导；Zotero、AI 和 Exa 均可延后配置。
3. 在欢迎页点击 **打开示例文献**，或点击 **上传文献** / 直接拖拽本地 PDF、PPT、PPTX 到阅读区。
4. 创建一条截图、文字高亮、下划线或页面标签批注。
5. 通过 **工具 → Markdown 笔记预览与导出** 查看实时生成的 Markdown 并下载 `.md`。
6. 根据实际需要再配置 LibreOffice、Zotero、AI 或 Exa。

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

Exa Key 不保存在工作区中。它使用服务端 `NodeSecretVault`（AES-256-GCM）加密后单独写入数据目录（`.knowex-data/exa.json`）。

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

### 代码命令：检查、测试与构建

```bash
npm run typecheck
npm run test
npx tsx --test src/server/web-app.test.ts
npm run build
npm start
```

生产构建会通过 Vite 将前端输出至 `dist/client/`，并通过 esbuild 将服务端构建至 `dist/server.mjs`，由根目录 `server.ts` 在 `0.0.0.0:3000` 统一托管。当前技术栈包括 Express 5、React 19、TypeScript、Vite、PDF.js、Zod、Vitest 与 Node.js 内置测试运行器。

## 代码框架

### 代码依赖方向

```text
React 功能界面
  -> 应用级 hooks
  -> 类型化 window.knowex API（src/renderer/src/web/web-knowex-api.ts）
  -> HTTP /api/* + 二进制上传 + Schema 校验（src/server/create-app.ts）
  -> WebWorkspaceManager 与领域服务（src/main/app-services.ts）
  -> 本地数据目录 / LibreOffice / Zotero API / AI endpoint / Exa API

共享领域模型与契约（src/shared/）
  -> 可被前后端各层导入
  -> 不得依赖 React、Express 或浏览器/Node 专属 API
```

浏览器渲染端不能直接访问服务端文件系统、加密凭据、LibreOffice 或外部 AI/Exa 密钥。所有高权限能力与 API Key 均在 Express 服务端执行，并通过经过 Zod 校验的 `/api/*` 契约暴露给前端。

### 代码目录结构

```text
Knowex/
├─ server.ts                  # Web 服务统一入口（监听 0.0.0.0:3000，开发/生产分发）
├─ vite.config.ts             # 前端 Vite SPA 配置（输出 dist/client）
├─ scripts/
│  └─ build-server.mjs        # 使用 esbuild 打包 Express 服务端至 dist/server.mjs
├─ src/
│  ├─ server/
│  │  ├─ create-app.ts        # Express 路由工厂、Zod 校验与 Vite/静态资源挂载
│  │  ├─ workspace-manager.ts # 多工作区管理、示例文献预置与 Markdown 读取/导出
│  │  └─ web-app.test.ts      # node:test 服务端与 API 集成测试
│  ├─ main/
│  │  ├─ app-services.ts      # 核心领域服务装配容器
│  │  ├─ ai/                  # AI 连接、Prompt、端点策略、云端与 CLI 适配器
│  │  ├─ assets/              # 截图资产和批注应用服务
│  │  ├─ document/            # 上传导入、内置示例 PDF 生成与 LibreOffice 转换
│  │  ├─ exa/                 # Exa 检索、正文抓取和独立加密设置
│  │  ├─ notes/               # Markdown 投影
│  │  ├─ storage/             # AES-256-GCM SecretVault、配置、凭据、索引与维护
│  │  └─ zotero/              # Local API、数据映射、导入和 Web API 导出
│  ├─ renderer/src/
│  │  ├─ web/                 # window.knowex HTTP/Browser 适配器
│  │  ├─ app/                 # 界面组合和应用级 hooks
│  │  ├─ components/          # 可复用布局、动作菜单、右键菜单和确认弹窗
│  │  ├─ features/            # 阅读器、批注、工作区切换、Markdown 预览、Exa、设置
│  │  ├─ i18n/                # 中英文类型化词典和语言状态
│  │  └─ styles/              # 基础、外壳、阅读器、批注和对话框样式
│  └─ shared/
│     ├─ contracts/           # 共享契约、Zod Schema 和公开 KnowexApi 接口
│     └─ domain/              # 文档、批注、工作区、设置、Zotero 和 Exa 实体
├─ docs/                      # 架构、开发、能力、安全和审计文档
├─ resources/                 # 静态资源与视觉测试图
└─ package.json               # dev / start / typecheck / test / build 脚本
```

### 核心模块关系

- `server.ts` 与 `src/server/create-app.ts` 负责启动 HTTP 服务、校验所有 `/api/*` 请求并在开发/生产模式下托管 SPA。
- `src/server/workspace-manager.ts` 管理 `.knowex-data/workspaces/*` 隔离目录、自动初始化默认工作区与示例文献，以及 Markdown 笔记读取与打包导出。
- `src/renderer/src/web/web-knowex-api.ts` 在浏览器启动时挂载 `window.knowex`，复用既有 hooks 与界面契约而无需修改核心阅读器与批注逻辑。
- `src/main/storage/secret-vault.ts` 提供基于 Node.js `crypto` AES-256-GCM 的服务端密钥加解密，保持凭据不回显与不落明文。
- `src/renderer/src/app/App.tsx` 负责界面组合；文档会话、工作区切换、拖拽上传、快捷键与确认弹窗由应用级 hooks 和独立模态框模块协同处理。
- `src/renderer/src/features/reader/` 负责 PDF 渲染、视口、导航、搜索和阅读工具。
- `src/renderer/src/features/research/` 与 `src/renderer/src/features/annotations/` 保留个人笔记、Exa 和 AI 的独立状态与服务边界。

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
