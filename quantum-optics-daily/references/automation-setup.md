# 自动化任务设置指引

## 概述

本文档说明如何创建每日文献推送和每周工作进展报告的定时自动化任务。

## 两个自动化任务

需要创建两个自动化 task：
1. **每日文献推送**：工作日 09:00 执行
2. **每周工作报告**：每周五 09:00 执行

## 创建前提

1. Codex 桌面版支持自动化任务（automation_update 工具可用）
2. 当前对话已加载 quantum-optics-daily 技能
3. 用户已确认以下默认参数

## 默认参数（用户可修改）

| 参数 | 默认值 | 说明 |
|---|---|---|
| 每日推送时间 | 09:00（工作日） | 周一至周五 |
| 每周报告时间 | 09:00（周五） | 每周五 |
| 报告保存路径 | D:\everyday_recommand\reports\ | 按年/月建子目录 |
| 日报保存路径 | D:\everyday_recommand\reports\ | 按年/月建子目录，Markdown 格式 |
| 报告语言 | 中文 | 元数据保留英文 |

## 创建每日文献推送任务

用 automation_update 创建 cron 任务：
- rrule: `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0`（工作日每天9点）
- prompt: "今天是工作日，请执行量子光学精密测量方向的文献推送，按 SKILL.md 工作流A执行，分析结果保存为 Markdown 文件到 D:\everyday_recommand\reports\[YYYY]\[MM]\[YYYY-MM-DD]-日报.md"
- 自动执行，不需要用户确认，需要推送通知

## 创建每周工作报告任务

用 automation_update 创建 cron 任务：
- rrule: `FREQ=WEEKLY;BYDAY=FR;BYHOUR=9;BYMINUTE=0`（每周五9点）
- prompt: "今天是周五，请执行量子光学精密测量方向的工作进展周报生成，按 SKILL.md 工作流B执行，结果以DOCX格式保存到 D:\everyday_recommand\reports\"
- 自动执行，不需要用户确认，需要推送通知

## 确认与验证

创建后：
1. 确认自动化任务已出现在自动化列表中
2. 第一次建议手动触发一次检查输出质量

## 备用方案

如果 automation_update 不可用：
- 改为每次对话提醒用户手动请求
- 用户手动输入 prompt：
  - 文献："按量子光学精密测量方向，今天推1-2篇文献"
  - 周报："帮我生成这周的工作进展周报"

## 删除/修改自动化

用 automation_update 工具更新或删除已有 cron 任务。
具体操作参考 Codex 桌面版的自动化管理界面。
