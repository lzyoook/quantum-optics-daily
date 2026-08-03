# 政策与企业信息来源

## 概述

本文档列出搜索政策和企业新闻时的关键词、目标机构和来源网站。

## 企业动态搜索

### 关键词组合

| 关键词 | 说明 |
|---|---|
| "quantum sensing startup" + "funding" | 量子传感创业公司融资 |
| "atomic magnetometer" + "commercial" | 原子磁力计商业化 |
| "quantum gyroscope" + "company" | 量子陀螺仪企业 |
| "squeezed light" + "commercial" | 压缩光源商业化 |
| "quantum memory" + "startup" | 量子存储创业公司 |
| "cold atom" + "industry" + "product" | 冷原子产业化 |
| "quantum sensor" + "product launch" | 量子传感产品发布 |

### 搜索来源偏好

公司官网 → PR Newswire → TechCrunch → VentureBeat → Nature Photonics news → Physics World

用 exa-search 的 --include-domains 参数指定来源。
限定时间窗口：最近 1 周。

## 政策动态搜索

### 关键词组合

| 关键词 | 说明 |
|---|---|
| "national quantum strategy" + "2026" | 国家量子战略 |
| "quantum technology" + "government funding" | 政府量子技术资助 |
| "quantum sensing" + "DARPA" | 美国 DARPA 量子传感 |
| "quantum sensing" + "DOE" | 美国能源部量子传感 |
| "quantum" + "NSF" + "funding" | 美国 NSF 量子资助 |
| "quantum flagship" + "EU" | 欧盟量子旗舰 |
| "quantum" + "中国" + "科技部" | 中国科技部量子政策 |
| "Moonshot" + "quantum" + "Japan" | 日本 Moonshot 量子计划 |
| "EPSRC" + "quantum" | 英国 EPSRC 量子计划 |

### 目标机构

- **美国**：NSF、DOE（SC）、DARPA、NIST、OSTP
- **欧洲**：欧盟 Quantum Flagship、UKRI/EPSRC、德国 BMBF、法国 CNRS
- **亚洲**：中国科技部、基金委、中科院；日本 Moonshot/Q-LEAP；韩国 KIST
- **国际**：ISO/IEC（量子技术标准）

### 搜索来源偏好

.gov、.edu 等官方来源；各大基金官网；Physics World、Nature News、Science News 等科学政策媒体。
发布时间：最近 1 个月。

## 使用方式

在 exa-search 中按以下方式调用：

```
uv run --with exa-py python "$SKILL_PATH/scripts/exa_search.py" \
  "quantum sensing startup funding 2026" \
  --category "news" --limit 5 \
  --include-domains "techcrunch.com,venturebeat.com,prnewswire.com" \
  --start-published-date "2026-07-15" \
  --end-published-date "2026-07-22"
```

注意替换 SKILL_PATH、搜索关键词和时间范围。
