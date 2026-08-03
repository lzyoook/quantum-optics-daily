# 量子光学精密测量 · 文献日报

## 概述

这个技能完成两件事：**每天给你搜1-2篇相关文献并做深度分析**，**每周五出一份工作进展报告**（Markdown 存本地，同时邮件推送到 1619838718@qq.com）。

你的方向是**量子光学精密测量实验**，涵盖：
- 分布式量子传感（精密测量用途）
- 量子干涉仪（以光学干涉仪为主：SU(1,1)非线性干涉仪、SU(2)型如MZ/Michelson干涉仪；兼顾光-原子混合干涉仪；量子增强、无损测量、多参数估计、ML/AI辅助）
- 热原子量子光源（特别是压缩光源）
- 热原子量子存储
 - 热原子光泵磁力计
  - 量子光纤陀螺仪（以光学Sagnac干涉仪为主，可结合热原子介质）
 
 期刊窗口：最近半年，三区以上——PR系列、OL、Optica、Nature Photonics/Nature Physics/Science 子刊及正刊。

优先实验类文章，兼顾理论。文献分析写中文，元数据（标题、作者、DOI）保留英文。

**深度分析必须基于全文（含补充材料），严禁仅凭摘要分析。**

## 环境依赖

| 依赖 | 用途 | 位置 |
|---|---|---|
| Codex 自带 Python 3.12 + pypdf + pdfplumber | 提取 Peer Review File / Supplementary Material 的 PDF 文本 | `C:\Users\16198\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe` |
| 系统 Python 3.x + PyPDF2 | 备用方案（沙箱内不可见，需用户手动运行） | `scripts/extract_pdf.py` |
| Node REPL MCP | 调用 Codex Python 进行 PDF 提取 | 已配置 |

**自动化流程**：Node REPL 通过 `child_process` 调用 Codex 自带的 Python（已预装 pypdf），全自动提取 PDF 文本。无需人工介入。系统 Python 仅作为备用方案。

---

## 前置准备

在第一次使用前做两件事：

### 1. 设置自动化

执行 `references/automation-setup.md` 中的指引创建两个定时任务：
- 工作日 09:00 — 文献日报
- 每周五 09:00 — 工作进展周报

自动化使用 `automation_update` 工具创建，详见该文件。

### 2. 确保搜索能力可用

本技能依赖以下 Codex 技能，在对话中它们应被自动加载：

| 依赖技能 | 用途 |
|---|---|
| `paper-lookup` | 通过 Semantic Scholar / arXiv / Crossref / OpenAlex 检索学术文献 |
| `exa-search` | 搜索企业动态、政策新闻、科技报道；获取非 OA 论文的全文 |
| `nature-academic-search` | 多源交叉验证、引文核查 |
| `smtplib` (Python 标准库) | 邮件推送周报 |

如果自动加载失败，在对话中主动调用这些技能即可。

---

## 工作流 A：每日文献推送

目的：每天推送 1-2 篇与你方向最相关的最新文献，附带结构化分析。

### A1. 搜索策略

1. **确定搜索关键词**：从 `references/search-keywords.md` 中选取当天关键词。轮换方向，避免连续多天搜同一个关键词。
2. **时间窗口**：最近 6 个月内。
3. **调用 paper-lookup 搜索**：
   - 优先用 Semantic Scholar 搜索
   - 回退到 OpenAlex 或 arXiv
4. **筛选**：去掉明显不相关的。
5. **偏好顺序**：实验 > 理论。有新物理 > 新技术方案。
6. **每日输出上限**：精读 1-2 篇，推荐阅读 3-5 篇。

### A2. 全文获取与补充材料（硬性要求）

在选定精读候选论文后，**必须**完成以下步骤才能开始深度分析：

1. **arXiv 全文获取**（优先）：
   - 通过 `https://arxiv.org/html/<arxiv_id>` 获取 HTML 全文逐段阅读。
2. **Nature 系列 / Optica / PR 系列**：通过期刊 OA PDF 或 arXiv 版本获取全文。
3. **补充材料（Supplementary Material）**：检索并获取。
4. **同行评审文件（Peer Review File）**：
   - Nature Communications 等子刊要求公开 peer review file。
   - **自动提取流程**：
     1. 确认 PR file URL 存在
     2. 通过 Node REPL `child_process` 调用 Codex 自带 Python 执行 `scripts/extract_pdf.py`：
        ```
        "C:\Users\16198\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
        "D:\everyday_recommand\quantum-optics-daily\scripts\extract_pdf.py"
        "<pr_file_url>"
        ```
     3. 读取 `D:\everyday_recommand\pr_text.txt`
     4. **读完后自动删除 `pr_text.txt`**
   - **降级策略**：如果 Codex Python 不可用（极端情况），在日报中标注"PR file 已获取但提取失败"，审稿人提问由分析者基于全文自行拟定。
5. **全文不可获取时**：该论文降级为推荐阅读，不得精读。

### A3. 深度分析模板

每篇文献的分析结构如下，具体模板见 `references/paper-analysis-framework.md`。

**基本信息**：标题、作者、机构、期刊、DOI、OA 状态、全文来源、补充材料链接、PR 文件链接
**文章定位**：解决的问题、理论/实验、核心工作
**核心贡献**（必须有正文依据）：改进、指标、解决的问题
**亮点与缺陷**
**作者展望**
**审稿人提问**：优先从 Peer Review File 提取（概括审稿人关切+作者回应），必要时自行补充，总数 3 个
**依据的原文段落**

### A4. 输出格式

1. 对话中直接输出。
2. 保存 Markdown 到 `D:\everyday_recommand\reports\[YYYY]\[MM]\[YYYY-MM-DD]-日报.md`。

---

## 工作流 B：每周工作进展周报

目的：每周五生成 DOCX 综合工作报告，含科研进展、企业动态、政策更新。

### B1-B2：信息收集（同上）
### B3：DOCX + Markdown 双格式生成
### B3：Markdown 格式生成
1. 生成 Markdown 周报，保存到 `D:\everyday_recommand\reports\[YYYY]\[MM]\[YYYY-MM-DD]-周报.md`
2. 格式简洁、手机端直接可读
### B4：邮件推送
1. 读取 `.env` 中的 SMTP 配置（smtp.qq.com:465）
2. 将 Markdown 版周报作为邮件正文发送到 1619838718@qq.com
3. 主题格式：`量子光学周报 [YYYY-MM-DD]`

---

## 工作流 C：手动检索

用户可随时指定检索方向，按 A1→A2→A3 执行。

---

## 文件说明

### references/
- `search-keywords.md` — 关键词列表
- `paper-analysis-framework.md` — 分析模板
- `weekly-report-template.md` — 周报模板
- `policy-sources.md` — 政策/企业信息源
- `automation-setup.md` — 自动化配置

### scripts/
- `extract_pdf.py` — PDF 文本提取脚本（支持 Codex 自带 Python 和系统 Python 双模式）

### assets/
- （预留）
