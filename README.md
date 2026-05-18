# NEV 智能导购 Agent

> **AI-powered New Energy Vehicle (NEV) Shopping Assistant**
>
> 基于 **LLM + MCP + RAG** 架构的新能源汽车智能导购系统，零框架依赖。

## 项目概况

该系统融合三层 AI 能力，帮助用户自动完成新能源汽车选购调研：

- **MCP 层**：通过 MCP 协议接入网页抓取和文件系统工具，实现实时信息检索和报告生成
- **RAG 层**：基于向量检索，从新能源汽车知识库中召回最相关的车型信息和对比数据
- **Agent 层**：自主设计的 tool-use 循环，LLM 自动决策何时检索知识库、何时联网查询、何时保存结果

**工作流**：用户输入购车需求 → Agent 检索知识库 → 联网对比最新资讯 → 生成结构化对比报告 → 保存至本地文件

## 架构设计

```
                          ┌─────────────────────────────────┐
                          │     Agent (Orchestrator)        │
                          │   invoke(prompt) → tool loop    │
                          └──────────┬──────────────────────┘
                ┌────────────────────┼────────────────────┐
                ▼                    ▼                    ▼
       ┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐
       │  ChatOpenAI  │   │  MCPClient[0]    │   │  MCPClient[1]    │
       │  (LLM 封装)   │   │  mcp-server-fetch│   │ server-filesystem│
       └──────────────┘   └──────────────────┘   └──────────────────┘
                                    │                      │
                           网页数据抓取             文件读写操作
       ┌──────────────────────────────────────────────────────────┐
       │              RAG Pipeline                              │
       │  EmbeddingRetriever → VectorStore(cosine similarity)   │
       │  Model: BAAI/bge-m3 | Top-K: 5                       │
       └──────────────────────────────────────────────────────────┘
```

## 知识库覆盖

10 份新能源汽车专业文档，覆盖主要品牌和对比维度：

| 文档 | 内容 |
|------|------|
| 01_byd.md | 比亚迪品牌及主力车型(海豹/海豚/汉/元PLUS/宋DM-i/唐EV) |
| 02_tesla.md | Tesla品牌及主力车型(Model 3/Y/Cybertruck) |
| 03_nio.md | 蔚来品牌及主力车型(ET5/ET7/ES6/ES8/EC6) |
| 04_xpeng.md | 小鹏品牌及主力车型(P7i/G6/G9/X9) |
| 05_lixiang.md | 理想品牌及主力车型(L6/L7/L8/L9) |
| 06_aion.md | 埃安品牌及主力车型(S/V/LX/Y) |
| 07_zeekr.md | 极氪品牌及主力车型(001/007/009/X) |
| 08_buying_guide.md | 新能源汽车选购指南(预算分层/电池/智驾/补能) |
| 09_comparison_sedan.md | 热门纯电轿车多维度对比(海豹/Model3/P7i/007/汉/ET5/ET7) |
| 10_comparison_suv.md | 热门新能源SUV对比及选购决策树 |

## 前置依赖

| 工具 | 用途 | 安装 |
|------|------|------|
| Node.js >= 18 | 运行环境 | [nodejs.org](https://nodejs.org) |
| pnpm | 包管理 | `npm install -g pnpm` |
| uvx | 运行 MCP Server (fetch) | `npm install -g uvx` |
| npx | 运行 MCP Server (filesystem) | 随 Node.js 自带 |

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量（复制并填写）
cp .env.example .env

# 3. 运行（开发模式）
pnpm dev

# 或构建后运行
pnpm build && pnpm start
```

## 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `OPENAI_API_KEY` | LLM API 密钥 | `sk-xxx` |
| `OPENAI_BASE_URL` | LLM API 地址 | `https://api.openai.com/v1` |
| `EMBEDDING_BASE_URL` | Embedding API 地址 | `https://api.openai.com/v1` |
| `EMBEDDING_KEY` | Embedding API 密钥 | `sk-xxx` |

支持任何 OpenAI 兼容的 API 供应商（OpenAI、SiliconFlow、DeepSeek、本地 vLLM 等）。

## 技术要点

- **零框架依赖**：纯手工实现 Agentic Loop，不依赖 LangChain/LlamaIndex/CrewAI
- **插件式 MCP**：可动态扩展工具集（添加 MCP Server 只需一行实例化代码）
- **可插拔供应商**：LLM + Embedding 均使用 OpenAI 兼容接口，切换供应商只需改环境变量
- **纯内存向量库**：基于余弦相似度，Brute-Force 搜索，适合中小规模知识库

## License

ISC
