# Knowex 开发与调试

## 启动开发版

在项目根目录运行：

```powershell
npm run setup
npm run dev
```

`npm run setup` 会安装依赖、检查并修复 Electron 运行时，同时报告 Node.js、LibreOffice、Zotero 和本地 AI CLI 的状态。也可以随时运行 `npm run doctor` 进行只读诊断；未配置的可选集成不会阻止 PDF 阅读开发。

依赖没有变化时不需要重复执行配置命令。`npm run dev` 会启动 Vite、Electron 主进程和渲染进程，并在代码修改后自动刷新界面。

## 打开开发者工具

在 Knowex 菜单中选择 **查看 → 开发者工具**。开发时建议同时保留启动 `npm run dev` 的 PowerShell 窗口。

开发者工具主要使用以下面板：

- **Console**：查看 React 界面错误、PDF.js 渲染错误和主动输出的日志。复现问题前先清空 Console，操作一次，然后保存第一条红色错误及其调用栈。
- **Elements**：检查按钮、侧栏、页面 Canvas 和文本层的尺寸与 CSS。这里的修改只用于试验，刷新后会消失。
- **Sources**：在 TypeScript/TSX 源文件中设置断点，使用单步执行检查状态和事件参数。
- **Network**：查看渲染进程发出的请求。Knowex 的文件系统、Zotero Local API 和模型请求位于 Electron 主进程，因此这些错误主要显示在 PowerShell 终端，而不一定出现在 Network。

## 推荐的问题记录方式

报告问题时同时提供：

1. 从启动命令到报错位置的终端输出；
2. Console 中第一条红色错误和展开后的调用栈；
3. 复现步骤，例如“连续模式 → 120% → 第 4 页框选”；
4. 当前版本、文档类型以及是否来自 Zotero；
5. 涉及显示问题时附上全窗口截图。

不要只截取最后一条连带错误。第一条错误通常最接近根因。

## 提交前检查

```powershell
npm run typecheck
npm test
npm run build
```

- `typecheck` 检查主进程、预加载脚本和 React 界面的类型契约；
- `test` 检查坐标、Markdown 和 Zotero 诊断等逻辑；
- `build` 验证生产环境打包入口。

需要验证完整桌面启动时，再运行 `npm run dev` 并手动完成一次目标操作。
# AI/API security checks

AI tests must use mocks or local fake servers. Do not use real API keys or paid provider requests in automated tests. Before release, also run:

```powershell
git diff --check
git ls-files out release node_modules dist coverage *.zip *.exe *.blockmap *.asar builder-debug.yml .env .env.* config.json *.log *.dmp
```

The second command should print no tracked source files. Keep installers and build outputs in GitHub Releases or CI artifacts.
