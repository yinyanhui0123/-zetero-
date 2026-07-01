# 基于 Zotero 的交通文献推送

## 项目简介

基于 Zotero 的插件，使用大模型与关键词/向量技术实现文献的智能追踪与推荐。插件从用户文献库构建兴趣画像（关键词模式秒级完成），通过**仅由本地 Python 服务**获取 arXiv 新文献，按相关度筛选后推送，并支持调用大模型生成文献内容概括。**菜单与设置界面为中文**（如：文献追踪、构建用户画像、推送今日文献、设置等）。

本分支额外实现了 **Elsevier / Scopus 交通期刊邮件推送**：每天早上 7 点自动检索与“城际出行、多层网络、交通可达性”等方向相关的论文，并按目标交通期刊白名单过滤后，通过 SMTP 发送到指定邮箱。当前默认聚焦 Transportation Research Part A/B/C/D/E、IEEE TITS、Transport Policy、Travel Behaviour and Society 等交通方向期刊。

## 参考项目与致谢

本项目是在以下开源项目基础上学习、整理和二次开发的：

- 原始参考项目：[Zhiwx1526/Zotero-Tracker](https://github.com/Zhiwx1526/Zotero-Tracker)
- Zotero 插件脚手架参考：[windingwind/zotero-plugin-template](https://github.com/windingwind/zotero-plugin-template)

本仓库在参考项目的 Zotero 文献追踪与推荐能力基础上，进一步补充了 Elsevier/Scopus 检索、交通期刊白名单过滤、QQ/163 SMTP 邮件推送、Windows 每日定时任务、以及面向“城际出行 / 多层网络 / 交通可达性”等研究方向的默认检索配置。

## 核心功能

1. **用户兴趣画像**：支持两种模式——**关键词模式**（默认，无 API、秒级构建）与**向量模式**（需 API、更准）
2. **文献检索**：**仅使用本地 Python 服务**（localhost:5000），不使用默认/第三方 API；使用前自动检查服务，可配置自动启动脚本
3. **智能筛选**：关键词匹配 + 可选向量相似度，可调相关度阈值；**推荐时始终排除已在库文献**（按 DOI 与 arXiv ID 匹配）
4. **推荐文献窗口**：独立窗口展示推荐列表，每篇可查看「内容概括」与在浏览器中打开摘要页；**放宽筛选条件时会在页面顶部显示说明**
5. **大模型概括**：支持 **OpenAI** 与 **DeepSeek** 对话 API 生成 2～3 句中文概括
6. **向量生成**：支持 **OpenAI Embeddings** 与 **DeepSeek 对话 API 生成向量**，用于用户画像（向量模式）与推荐相关度计算
7. **设置与验证**：API 提供商、API 密钥、用户画像模式、文献服务自动启动路径、快捷键；支持「验证 API 密钥」
8. **快捷键**：默认空格键触发文献追踪，可修改
9. **Elsevier 邮件推送**：支持 Elsevier/Scopus API 检索、交通期刊白名单过滤、QQ/163 等 SMTP 邮件发送、Windows 计划任务每日自动运行

## 技术架构

- **前端**：XUL + 内嵌 HTML（Zotero 原生 UI）
- **后端**：Zotero Plugin API（ztoolkit）
- **存储**：用户画像为 JSON 文件（配置目录下 `literature-tracker-profile.json`，由 bootstrap 读写）；向量/文献表使用 Zotero.DB；Zotero Prefs 存 API 密钥、profileMode、pythonServerStartCommand 等
- **文献来源**：仅本地 Python 服务（http://localhost:5000），无其他 API 回退
- **大模型**：OpenAI / DeepSeek 对话 API（概括、验证）；向量为 OpenAI Embeddings 或 DeepSeek 对话生成向量（统一 1536 维）
- **每日邮件推送**：`python/elsevier_email_push.py` 读取 `.env` 中的 Elsevier API、关键词、期刊白名单与 SMTP 配置，生成 HTML 邮件并发送

## Elsevier 交通期刊邮件推送

### 1. 配置环境变量

复制 `.env.example` 为 `.env`，填写本机私密配置。`.env` 已在 `.gitignore` 中，不能提交到 GitHub。

```env
ELSEVIER_API_KEY=your_elsevier_api_key
ELSEVIER_SOURCE=scopus
ELSEVIER_QUERY=
ELSEVIER_KEYWORDS=intercity travel, intercity mobility, multilayer transport network, transport accessibility
ELSEVIER_DOMAIN_FILTER=transportation, transport, mobility, transit, railway, rail, high speed rail, accessibility
ELSEVIER_MAX_RESULTS=20
ELSEVIER_CANDIDATE_MULTIPLIER=8
ELSEVIER_DAYS=7
ELSEVIER_STRICT_JOURNAL_FILTER=true
ELSEVIER_JOURNAL_FILTER=Transportation Research Part A: Policy and Practice, Transportation Research Part B: Methodological, Transportation Research Part C: Emerging Technologies, Transportation Research Part D: Transport and Environment, Transportation Research Part E: Logistics and Transportation Review, IEEE Transactions on Intelligent Transportation Systems, Transport Policy, Travel Behaviour and Society

SMTP_HOST=smtp.qq.com
SMTP_PORT=465
SMTP_USER=your_mail@qq.com
SMTP_PASSWORD=your_smtp_authorization_code
MAIL_TO=target_mail@163.com
```

`SMTP_PASSWORD` 应使用邮箱 SMTP 授权码，不是邮箱登录密码。

### 2. 手动测试推送

只生成内容、不发邮件：

```powershell
python python\elsevier_email_push.py --dry-run
```

正式发送邮件：

```powershell
python python\elsevier_email_push.py
```

### 3. 设置每天 7 点自动发送

方式一：使用 Windows 本地计划任务。Windows 下运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install_elsevier_email_task.ps1
```

脚本会创建名为 `Zotero Tracker Elsevier Email Push` 的计划任务，每天 07:00 自动运行邮件推送。

注意：本地计划任务依赖本机运行环境。如果电脑完全关机，任务无法执行；如果只是睡眠，需要系统允许“唤醒定时器”。

方式二：使用 GitHub Actions 云端定时任务。仓库已包含 `.github/workflows/elsevier-email-push.yml`，会在每天北京时间 07:00 运行。此方式不依赖本机开机，但需要在 GitHub 仓库中配置 Secrets：

```text
ELSEVIER_API_KEY
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
MAIL_TO
```

配置入口：

```text
GitHub 仓库 -> Settings -> Secrets and variables -> Actions -> New repository secret
```

GitHub Actions 使用 UTC 时间，工作流中的 `0 23 * * *` 对应北京时间每天 07:00。GitHub 的定时任务可能有几分钟延迟，这是平台正常行为。

如果你之前已经在本地发送过邮件，建议在 GitHub Secrets 配好后先手动运行一次工作流，并选择 `record-only` 模式。该模式只记录当前候选论文为已发送，不会发送邮件，可用于初始化 GitHub Actions 的去重历史。

### 4. 避免重复推送

脚本会把已成功发送的论文记录到：

```text
.cache/elsevier_sent_history.json
```

后续运行时会按 DOI 或标题过滤已发送过的论文，尽量保证每天推送的是新论文。GitHub Actions 版本会用 Actions cache 保存这份历史记录。

### 5. Zotero 文件夹兴趣种子

可以在 `.env` 中配置 Zotero collection 名称：

```env
ZOTERO_COLLECTION_NAMES=城际出行, 多层网络, 交通可达性, 我的收藏, 需要用到的论文
ZOTERO_SQLITE_PATH=
```

如果填写 `ZOTERO_SQLITE_PATH`，脚本会尝试从对应 Zotero 文件夹中的论文标题、摘要和标签提取关键词；如果不填写，会使用内置交通方向关键词兜底。

### 6. GitHub 上传安全要求

上传 GitHub 前请确认：

- 不提交 `.env`
- 不提交 `node_modules/`
- 不提交 `.scaffold/` 构建产物
- 不提交邮箱授权码、Elsevier API Key、OpenAI/DeepSeek Key
- 只提交 `.env.example` 作为配置模板

## GitHub 上传操作

如果是首次上传到一个新的 GitHub 仓库：

```powershell
git init
git add .
git commit -m "feat: add literature tracker and Elsevier email push"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

如果仓库已经存在，只需要替换远程地址后推送：

```powershell
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

上传前可以检查将要提交的文件：

```powershell
git status --short
git check-ignore -v .env
```

其中 `git check-ignore -v .env` 应显示 `.env` 被 `.gitignore` 忽略。

## 安装方法

### 1. 安装 Zotero 插件

1. 在项目根目录执行 `npm run build`，在 `.scaffold/build/` 下生成 `literature-tracker.xpi`
2. 在 Zotero 中：**工具** → **插件** → 右上角齿轮 → **从文件安装插件...**
3. 选择上述 XPI 文件，安装后重启 Zotero

### 2. 安装并启动 Python 文献服务

1. 需 Python 3.8+
2. 启动方式：
   - Windows：双击 `start-server.bat`
   - macOS/Linux：`python python/literature_server.py`
3. 服务在 `http://localhost:5000` 运行，依赖（Flask、arxiv 等）会自动安装

**说明**：插件在执行「追踪文献」或「推送今日文献」前会**自动检查**该服务是否已启动；若未启动且已在设置中填写「文献服务自动启动」路径，会**尝试自动执行该脚本**（如 `start-server.bat` 的完整路径）。

### 3. 验证服务

浏览器访问 `http://localhost:5000/health`，若返回 `{"status":"ok"}` 表示正常。

## 使用方法

### 0. Python 文献服务

- **不配置自动启动**：使用前请手动运行 `start-server.bat` 或 `python python/literature_server.py`；若未运行，插件会提示「文献服务未启动」。
- **配置自动启动**：在设置中填写「文献服务自动启动」为 `start-server.bat` 的**完整路径**并保存；之后若检测到服务未运行，插件会尝试执行该脚本后再继续。

### 1. 配置设置

1. **工具** → **文献追踪** → **设置**，或 **编辑** → **首选项** → 找到插件 **Literature Tracker** 进入设置
2. **API 提供商**：DeepSeek（国内推荐）或 OpenAI
3. **大模型 API 密钥**：用于文献概括与（若选向量模式）向量生成；保存后可用「验证 API 密钥」确认
4. **用户画像模式**：**关键词**（推荐，秒级构建、无需 API）或 **向量**（更准、需 API）
5. **文献服务自动启动**：可选，填 `start-server.bat` 的完整路径以便未启动时自动启动
6. **快捷键**：默认空格，可改
7. 点击 **保存设置**

### 2. 触发文献追踪

- 按设置的快捷键（默认空格），或 **工具** → **文献追踪** → **追踪文献**

### 3. 查看推荐文献

- **工具** → **文献追踪** → **推送今日文献**（打开推荐文献窗口）
- 推荐列表**仅包含当前未在库中的文献**（按 DOI、arXiv ID 与库中条目比对）
- 在推荐文献窗口中可查看每篇的「内容概括」、在浏览器中打开摘要页
- 当因相关度或匹配数不足而**放宽筛选条件**时，页面顶部会显示黄色提示条说明

### 4. 用户画像

- **构建用户画像**：**工具** → **文献追踪** → **构建用户画像**
- 关键词模式：仅从文献标题与摘要提取词频，无 API 调用，很快完成
- 向量模式：会调用大模型生成向量，耗时较长
- 新增文献后需再次执行「构建用户画像」以重建画像
- **查看用户画像**：**工具** → **文献追踪** → **查看用户画像**，可确认当前画像模式、关键词数量与前 10 个关键词，用于验证是否成功使用

### 5. 如何验证用户画像是否成功使用

1. **构建后看通知**：执行 **构建用户画像** 后，会弹出通知显示「已构建画像（关键词模式）：N 关键词」或「已构建画像：M 主题，N 关键词」，说明画像已写入。
2. **菜单里查看摘要**：**工具** → **文献追踪** → **查看用户画像**。若尚未构建会提示先构建；若已构建会显示当前模式（关键词/向量）、关键词数量、最后更新时间，并在调试输出中打印前 10 个关键词，可确认画像内容。
3. **看推荐是否在用**：执行 **推送今日文献** 打开推荐窗口时，若画像存在会先用画像中的关键词筛选文献，再按相关度排序。打开 **帮助** → **调试输出** → **查看输出**，筛选 `Literature Tracker`，可看到类似 `Filtered papers by keywords: X out of Y`，说明画像的关键词已参与筛选。
4. **无画像时**：若未构建画像，推荐流程会跳过关键词筛选（或使用默认相关度），日志中会出现 "User profile not found" 或 "No keywords found in user profile"。

## 项目结构

```
├── addon/
│   ├── content/
│   │   ├── preferences.xhtml   # 设置页（API、画像模式、文献服务自动启动、快捷键等）
│   │   └── recommended-papers.xhtml
│   ├── bootstrap.js            # 含 Python 服务自动启动逻辑（tryStartPythonServer）
│   ├── manifest.json
│   └── prefs.js
├── src/
│   ├── addon.ts                # 主逻辑、ensurePythonServer、追踪与推荐入口
│   ├── hooks.ts
│   ├── index.ts
│   ├── modules/
│   │   ├── arxivCrawler.ts     # 仅请求 Python 服务，无默认 API
│   │   ├── userProfile.ts      # 关键词/向量画像
│   │   ├── vectorGenerator.ts  # OpenAI Embeddings / DeepSeek 对话向量
│   │   └── ...
│   └── utils/
├── python/                     # 文献服务（Flask + arxiv）
├── package.json
└── .scaffold/build/
```

## 配置项说明

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| apiProvider | 大模型提供商：openai / deepseek | deepseek |
| apiKey | 大模型 API 密钥（概括与向量） | 空 |
| profileMode | 用户画像模式：keyword / vector | keyword |
| pythonServerStartCommand | 文献服务未运行时自动启动脚本完整路径 | 空 |
| relevanceThreshold | 相关度阈值 | 0.7 |
| shortcutKey | 触发追踪的快捷键 | 空格 |
| trackArxiv / trackPubmed | 是否追踪对应站点 | true |
| categories / keywords / authors | 追踪分类、关键词、作者 | 见代码 |

## 常见问题

### 1. 提示「文献服务未启动」

- 先手动运行 `start-server.bat` 或 `python python/literature_server.py`，确认 `http://localhost:5000/health` 返回 `{"status":"ok"}`
- 若希望自动启动：在设置中填写「文献服务自动启动」为 `start-server.bat` 的**完整路径**并保存

### 2. 提示「未读取到 API 密钥」或「需要配置大模型」

- 在设置中填写 API 密钥并点击 **保存设置**
- 若仍提示，请重启 Zotero 或重新打开推荐文献窗口后再试

### 3. 插件无法初始化

- 确认 Zotero 版本（建议 6.0+）
- 查看 **帮助 → 调试输出 → 查看输出** 中的 `[Literature Tracker]` 日志

### 4. 文献追踪无结果

- 确认 Python 文献服务已启动（检索**仅使用**该服务，无其他 API）
- 检查相关度阈值、用户画像是否已构建

### 5. 大模型 API 失败

- 使用设置页「验证 API 密钥」检查密钥与网络
- DeepSeek Key 请从 [platform.deepseek.com](https://platform.deepseek.com) 获取，注意无多余空格或换行

## 开发指南

### 环境要求

- Node.js 18+
- npm 9+
- Zotero 6.0+

### 常用命令

```bash
npm install
npm run build    # 输出 .scaffold/build/literature-tracker.xpi
npm start
npm run lint:check
npm run lint:fix
```

### 调试

- Zotero：**帮助** → **调试输出** → **查看输出**，筛选 `[Literature Tracker]`

## TODO

### 已完成

- [x] 设置页：API 提供商、API 密钥、用户画像模式、文献服务自动启动、快捷键、验证
- [x] 推荐文献窗口、内容概括、在浏览器中打开摘要
- [x] 用户画像：关键词模式（快）/ 向量模式；DeepSeek 对话 API 向量生成；画像存 JSON 文件（bootstrap 读写）
- [x] 文献检索仅用 Python 服务；使用前自动检查服务、可选自动启动
- [x] 移除默认/第三方文献 API，仅保留 localhost:5000
- [x] 推荐时排除已在库文献（DOI + arXiv ID）；无结果时放宽相关度并保证有列表；放宽时在推荐页标注

### 计划中

- [ ] 引用追踪
- [ ] PubMed 集成
- [ ] 更多可追踪站点

## 贡献与许可

欢迎提交 Issue 与 Pull Request，提交信息建议使用英文并遵循 Conventional Commits。

本项目采用 **AGPL-3.0** 许可证，详见 [LICENSE](LICENSE)。

---

**注意**：插件会调用大模型 API（OpenAI、DeepSeek），请遵守各服务的使用条款与隐私政策。文献数据仅通过本地 Python 服务获取，不经过其他第三方文献 API。
