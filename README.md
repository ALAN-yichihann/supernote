# Supernote

> 为错综复杂的理科知识体系撰写逻辑清晰的笔记，并让 AI 参与学习。

Supernote 是一个本地优先的桌面笔记应用：把知识拆成**基本事实、推导步骤、结论**三类基本单位，用**域**组织、用**单向或双向连接**表达推导关系，再沿着连接自动生成可读的推导过程。界面基于 React + TypeScript，桌面壳基于 Python pywebview，笔记与密钥都保存在本机。

![主界面](artifacts/problem3-main.png)

## 功能

- **总思维导图**：知识域画布，右键即可增删改基本单位与连接；节点内容支持 Markdown 与 KaTeX 公式（`$E=mc^2$`），每个基本单位可附带一张图片和一段批注。
- **连接语义**：连接区分单向推导和双向推导；单向连接可反转方向，双向连接可拆成任一方向的单向连接。
- **推导语义**：带「结论」标签的单位，不同入连接代表不同的推导方式（任选其一）；其余单位的所有入连接都是必要条件，生成推导过程时必须全部包含。
- **合并展示**：一个单位恰有一条单向入边和一条单向出边、且出边指向同域单位时，与后继合并为一张卡片，内部用浅灰细线分隔；悬停、右键仍作用于单个单位，多条分支汇合的单位保持独立卡片。
- **标签体系**：内置「基本事实 / 结论 / 课内 / 课外」四个默认标签（不可修改），可自定义标签名称与颜色；导图工具栏可按标签高亮相关单位。
- **推导过程**：左侧推导子图从目标反向展开到基本事实，展示全部可能用到的单位与连接；点击虚线连接或「推导方式」按钮切换结论的证明分支，其余分支自动淡出；必要模块全部进入推导顺序，可拖动调整并行模块的先后，再拼接成文本（图片统一置顶）。
- **AI 辅助**：右侧 AI 面板支持流式问答；节点的右键菜单可把基本单位加入 AI 对话；问答 AI 与思维导图 AI 各自配置端点、模型和 KEY，KEY 存入系统凭据。
- **提示词外置**：`prompts/qa.md` 与 `prompts/graph.md` 就是系统提示词，用户可直接编辑，下一次请求即生效。
- **本地文件**：笔记与推导快照均为 JSON；桌面宿主采用临时文件 + 原子替换写入，顶栏用脏标记提示未保存修改，支持撤回/恢复。

![推导过程](artifacts/problem9-proof-default.png)

## 环境要求

| 依赖 | 版本 |
| --- | --- |
| Node.js | 20.19+ 或 22.12+（Vite 7 要求） |
| Python | 3.11+（使用到 `X \| None`、`dict[str, Any]` 等语法） |
| 系统 | Windows / macOS / Linux；打包脚本面向 Windows |

## 安装

```powershell
npm install
python -m pip install -r requirements.txt
```

## 运行

开发模式需要两个终端：

```powershell
# 终端 1：前端热更新服务（127.0.0.1:5173）
npm run dev

# 终端 2：桌面宿主，加载 Vite 页面
python -m desktop.main --dev
```

生产模式：

```powershell
npm run build
python -m desktop.main
```

也可以只用浏览器预览 `npm run dev` 打开的页面：画布编辑、导入/导出 JSON 可用；**AI 对话、系统文件对话框、凭据存储需要桌面模式**，此时页面会给出提示。

## 使用指南

### 画布与右键菜单

| 右键位置 | 菜单项 |
| --- | --- |
| 域外空白处 | 添加域（域之间不能重叠） |
| 域标题 / 域内空白 | 添加基本单位、重命名域、删除域（二次确认，连同域内节点） |
| 基本单位 | 添加到 AI 对话框、添加单向出/入/双向单位、编辑、添加单向入/出/双向连接、删除、显示推导过程 |
| 连接线 | 单向时：修改为双向连接、反转方向、删除连接；双向时：拆成两个方向的单向连接、删除连接 |

- 「添加…单位」会创建目标单位的草稿并打开编辑页，保存后才写入笔记；连线模式在画布上拖出虚线预览，点击目标单位完成，`Esc` 取消。
- 域可以整体拖动，但不能与其他域重叠。
- 顶部标签栏点击标签本身收起/展开对应面板，点击 `×` 才关闭；面板右侧边框可拖动调整宽度。

### 编辑基本单位

编辑页以浮层面板呈现，左写 Markdown、右看实时预览，可上传一张不超过 5MB 的图片、填写批注、勾选标签。保存后自动重新计算合并展示。基本事实与结论、课内与课外互斥，切换一个会取消同组另一个。

### 生成推导过程

在基本单位上选择「显示推导过程」：

1. 左侧子图从目标反向展开到基本事实：实线是必须满足的必要条件，虚线是可选的推导方式；
2. 点击虚线连接，或点击「推导方式」中的按钮切换结论的证明分支，其他分支自动淡出；
3. 下方「推导顺序」列出全部必要模块，拖动可调整并行模块的先后顺序，会破坏依赖的移动会被拒绝；
4. 点击「生成推导文本」，按当前顺序拼接内容，图片置于文本最上方；
5. 右上角可切换编辑/阅读模式、导出推导快照；「保存并同步」把这次推导以快照形式写入笔记的 `proofs` 字段。

以示例 `examples/example.json` 为例：`基本事实1 → 基本单位2`、`基本事实1 → 基本单位3 → 基本单位4`、`基本单位2 & 基本单位4 → 基本单位5`、`基本单位5 | 基本事实6 → 结论7`。默认走汇合分支时，推导顺序包含基本事实 1 与基本单位 2～5；切到基本事实 6 后只保留该分支；拖动「基本单位 2」与「基本单位 3」可互换位置，但「基本单位 4」必须在「基本单位 3」之后。

### 配置 AI

左侧栏「设置」分别填写问答 AI 与思维导图 AI 的端点、模型、KEY，端点需兼容 OpenAI Chat Completions 协议（请求 `<端点>/chat/completions`）。KEY 由桌面宿主保存到系统凭据（Windows 凭据管理器 / macOS Keychain / Linux Secret Service），不会写入笔记或日志。

### 快捷键与交互

| 操作 | 效果 |
| --- | --- |
| `Esc` | 取消连线、关闭右键菜单 |
| `Enter` | 发送 AI 消息 |
| `Shift+Enter` | AI 输入框内换行 |

## 数据格式

笔记文件（`kind: "supernote"`，版本 1）：

```json
{
  "kind": "supernote",
  "version": 1,
  "id": "0f0c…",
  "title": "微积分基础",
  "domains": [{ "id": "d1", "name": "极限", "position": { "x": 60, "y": 60 } }],
  "nodes": [
    {
      "id": "n1",
      "domainId": "d1",
      "content": "若 $\\lim_{x\\to a} f(x)=L$，则……",
      "tags": ["fact"],
      "annotation": "",
      "position": { "x": 40, "y": 80 },
      "image": "data:image/png;base64,…"
    },
    {
      "id": "n2",
      "domainId": "d1",
      "content": "由此得到……",
      "tags": ["conclusion"],
      "annotation": "",
      "position": { "x": 430, "y": 80 }
    }
  ],
  "edges": [{ "id": "e1", "source": "n1", "target": "n2", "direction": "single" }],
  "tags": [{ "id": "fact", "name": "基本事实", "color": "#c89932" }],
  "proofs": []
}
```

约束由 `src/core.ts` 中的 zod 模型统一校验：ID 全局唯一；节点必须属于已存在的域；标签必须已定义且同组互斥；连接两端存在、不能自连、同一对节点只允许一条连接；四个默认标签的名称与颜色不可改动。

推导快照（`kind: "supernote-proof"`）保存目标单位、闭包内的 `nodeIds` / `edgeIds`、模块顺序 `order`，以及节点与连接的副本，因此即使原笔记继续修改，快照仍可独立校验和阅读；缺少 `order` 的旧版快照按 `nodeIds` 顺序读取。

## 项目结构

```
src/
  core.ts            图模型与 zod 校验、编辑操作、合并展示、推导闭包与拓扑排序
  core.test.ts       推导语义与顺序约束的 Vitest 单元测试
  store.ts           zustand 全局状态：当前笔记、撤销/恢复、AI 锁定、保存标记
  bridge.ts          前端与桌面 API 的桥接，浏览器模式下的文件回退
  App.tsx            整体布局、顶部标签、左侧栏、标签与设置弹窗
  style.css          蓝色系设计系统与面板样式
  components/
    Graph.tsx        React Flow 画布、域与合并卡片、右键菜单、连线交互
    Editor.tsx       基本单位编辑面板（Markdown、图片、批注、标签）
    Proof.tsx        推导过程面板（推导子图、分支切换、模块排序、快照保存）
    AI.tsx           AI 对话面板（消息流、附件节点、取消请求）
    Common.tsx       Markdown 渲染、图标按钮、弹窗、拖拽手柄
desktop/
  main.py            pywebview 入口与 JS API（文件、设置、AI）
  storage.py         原子写入与 keyring 凭据
  ai.py              流式 Chat Completions 会话
  prompts.py         从 prompts/ 加载系统提示词
prompts/             可由用户编辑的问答 AI / 思维导图 AI 提示词
examples/            可导入的示例笔记（含多前置推导示例）
tests/               Python 单元测试（存储、提示词加载）
scripts/package.ps1  PyInstaller 打包脚本
artifacts/           界面验证截图
```

## 开发与检查

```powershell
npm test                          # Vitest：推导语义、顺序约束、快照校验
npm run build                     # tsc -b + vite build
python -m pytest                  # Python 单元测试
python -m ruff check desktop tests
npm run test:e2e                  # Playwright（需先准备配置与用例）
```

提交前保持 `npm run build`、`python -m pytest`、`ruff` 三项干净。

## 打包

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package.ps1
```

脚本先 `npm run build`，再用 PyInstaller 以窗口模式打包 `desktop/main.py`，最后把 `prompts/` 复制到 `dist/Supernote/prompts`。分发时请保持提示词目录与可执行文件同级；也可通过环境变量 `SUPERNOTE_PROMPT_DIR` 指向自定义提示词目录。

## 提示词定制

- 编辑 `prompts/qa.md`（问答 AI）或 `prompts/graph.md`（思维导图 AI）；
- 提示词里已列出 `search_units`、`get_neighbors`、`create_domain`、`create_unit`、`update_unit`、`create_link`、`delete_unit` 等工具约定；
- 保存文件后重新发起请求即可生效，无需重启应用。

## 当前限制

- AI 依赖 OpenAI 兼容的 `/chat/completions` 流式接口，暂不支持其他协议；
- 桌面端 `start_ai` 目前把整份笔记 JSON 与用户问题发给问答 AI，界面上加入对话的基本单位、图片与历史消息尚未随请求发送；
- 推导快照可以导出并写入笔记，但「打开保存的推导过程」入口尚未接入文件选择流程；
- 推导子图按最长依赖链自动分层，依赖层级很深时整体会缩小显示，可在画布上缩放查看；
- 浏览器模式不支持 AI、系统对话框和凭据存储。

## 相关文档

- [AGENTS.md](AGENTS.md)：开发指南（架构、命令、约束）；
- [指令.md](指令.md)：需求与历次问题反馈记录。

## 约定

所有说明与代码注释使用简体中文；修改图数据必须经过核心命令与校验，AI 事务提交前检查原笔记版本。
