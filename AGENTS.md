# Supernote 开发指南

所有说明与代码注释使用简体中文。修改前先阅读相关实现，复杂修改先说明计划。

## 架构

- `src/core.ts`：图模型、验证、编辑命令、展示合并、推导语义（结论任选一条入连接、其余单位取全部必要条件）与拓扑排序。
- `src/store.ts`：唯一笔记状态、事务、修改历史和保存状态。
- `src/components`：导图、推导、AI、设置与编辑器。
- `desktop`：Python 桌面宿主、原子文件存储、凭据及 AI 服务。
- `prompts`：可由用户直接编辑的问答 AI 和思维导图 AI Markdown 提示词。
- `tests`：Python 与浏览器端验收；核心 TypeScript 测试位于源码旁。
- `examples`：可导入的演示笔记。

## 开发和验证

安装：`npm install`、`python -m pip install -r requirements.txt`。
界面预览：`npm run dev`。桌面开发：启动 Vite 后运行 `python -m desktop.main --dev`。
生产运行：`npm run build` 后运行 `python -m desktop.main`。
检查：`npm test`、`npm run build`、`python -m pytest`、`python -m ruff check desktop tests`。
浏览器验收：`npx playwright install chromium` 后执行 `npm run test:e2e`。
打包：`powershell -ExecutionPolicy Bypass -File scripts/package.ps1`。

提示词修改：编辑 `prompts/qa.md` 或 `prompts/graph.md` 后重新发起 AI 请求即可生效；打包时将提示词目录放在应用目录旁。

修改图数据必须经过核心命令和验证；AI 事务提交前检查原笔记版本，禁止局部提交。密钥只存系统凭据，不得写入笔记或日志。按完成阶段提交 Git。
