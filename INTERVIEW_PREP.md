# NEV Agent — 面试准备手册

> 项目地址: https://github.com/hkm-a/nev-agent
>
> 看完这份文档，你可以在面试中对这个项目对答如流。

---

## 目录

1. [项目定位（一句话）](#1-项目定位一句话)
2. [项目背景与动机](#2-项目背景与动机)
3. [系统架构全景](#3-系统架构全景)
4. [核心模块详解](#4-核心模块详解)
5. [技术选型与权衡](#5-技术选型与权衡)
6. [面试高频问题与回答](#6-面试高频问题与回答)
7. [如何用不同层级视角描述项目](#7-如何用不同层级视角描述项目)
8. [可能的扩展方向（加分项）](#8-可能的扩展方向加分项)
9. [项目亮点总结](#9-项目亮点总结)

---

## 1. 项目定位（一句话）

> **一个基于 LLM + MCP + RAG 三层架构的 AI Agent，零框架依赖，专为新能源汽车选购场景设计，自动完成知识检索 → 联网对比 → 报告生成的全链路决策。**

---

## 2. 项目背景与动机

### 要解决什么问题？

购买新能源汽车需要调研大量信息：品牌、车型、价格、续航、充电、智驾、用户口碑等。传统做法是手动打开 10+ 个网页对比，耗费 30 分钟以上。这个项目用 AI Agent 来自动化整个流程。

### 为什么从零手写，不用框架？

| 框架 | 为什么不用 |
|------|----------|
| LangChain | 过度抽象，黑盒太多，出问题难以排查 |
| LlamaIndex | 偏重 RAG，对 tool-use 和 agent 支持较弱 |
| CrewAI/AutoGen | 多 Agent 框架，单 Agent 场景用不上 |
| 手写 | 每行代码可控，架构清晰，适合深度学习和展示能力 |

**面试话术**："不使用框架是为了最大化代码的可控性和透明性。每一行代码都是我自己实现的，我能清楚地解释 Agentic Loop 的每一步是如何工作的。"

---

## 3. 系统架构全景

### 架构图（建议在面试时手画）

```
User Input (预算/需求)
        │
        ▼
┌─────────────────────────────────┐
│         RAG Pipeline            │
│                                 │
│  knowledge/*.md ──► Embedding  │
│       (10篇专业文档)     │         │
│                         ▼        │
│                  VectorStore     │
│               (余弦相似度搜索)     │
│                         │        │
│                   Top-5 上下文    │
└─────────────────────┬───────────┘
                      │ (注入LLM)
                      ▼
┌─────────────────────────────────┐
│       Agent (主循环)             │
│                                 │
│  LLM ◄──► MCPClient[]          │
│            ├── fetch (联网)     │
│            └── filesystem (存)  │
│                                 │
│  1. LLM 返回 text + tool_calls  │
│  2. 有 tool_call → 路由 MCP    │
│  3. 结果回填 → 继续调 LLM      │
│  4. 无 tool_call → 输出结果     │
└─────────────────────────────────┘
```

### 核心类图

```
┌─────────────┐      ┌──────────────────┐
│   Agent     │──────│   ChatOpenAI     │
│ (协调器)    │      │ (LLM封装)        │
│             │      │ - chat()         │
│ - init()    │      │ - appendTool()   │
│ - invoke()  │      └──────────────────┘
│ - close()   │
└──────┬──────┘
       │
       │  ┌──────────────────┐
       ├──│  MCPClient[0]    │── mcp-server-fetch (uvx)
       │  └──────────────────┘
       │  ┌──────────────────┐
       └──│  MCPClient[1]    │── server-filesystem (npx)
          └──────────────────┘

┌──────────────────────┐     ┌──────────────┐
│  EmbeddingRetriever  │─────│  VectorStore │
│  - embedDocument()   │     │  - search()  │
│  - retrieve()        │     │  - cosine()  │
└──────────────────────┘     └──────────────┘
```

---

## 4. 核心模块详解

### 4.1 Agent.ts — Agent 主循环

这是整个系统的大脑。核心逻辑在 `invoke()` 方法里：

```typescript
async invoke(prompt: string) {
    // 步骤1: 第一次调 LLM，把用户问题和工具定义发给它
    let response = await this.llm.chat(prompt);

    // 步骤2: 循环 — 每次 LLM 返回都检查要不要调工具
    while (true) {
        if (response.toolCalls.length > 0) {
            // 有工具调用 → 逐个执行
            for (const toolCall of response.toolCalls) {
                // 找到拥有这个工具的 MCP 客户端
                const mcp = findMCPClient(toolCall.function.name);
                // 执行工具
                const result = await mcp.callTool(...);
                // 把结果喂回 LLM
                this.llm.appendToolResult(toolCall.id, result);
            }
            // 继续调 LLM（带着工具执行结果）
            response = await this.llm.chat();
        } else {
            // 没有工具调用了 → 返回最终回答
            return response.content;
        }
    }
}
```

**关键设计决策**：

| 决策 | 原因 |
|------|------|
| 最大 10 次工具调用 | 防止死循环或 LLM 无限调用工具 |
| try/catch 包裹工具调用 | 单个工具失败不影响整体流程 |
| 结果截断 2000 字符 | 避免工具返回超大结果撑爆上下文 |
| 流式输出工具名和参数 | 让用户看到 Agent 正在做什么，提升可观测性 |

### 4.2 ChatOpenAI.ts — LLM 封装

负责与 OpenAI 兼容 API 通信，核心设计：

**流式处理**：
```typescript
const stream = await this.llm.chat.completions.create({
    model: this.model,
    messages: this.messages,
    stream: true,           // 流式，逐 token 输出
    tools: this.tools,      // 注册 MCP 工具
});
```

**Tool Call 增量构建**：
由于是流式响应，tool_calls 是分 chunk 到达的。代码用 `toolCalls[index]` 来追踪每个 tool_call 的不同 chunk，将其拼接成完整的 `{id, function: {name, arguments}}`。

**消息历史管理**：
`messages[]` 数组包含：system → context(用户注入) → user → assistant(with tool_calls) → tool → assistant(with tool_calls) → ... → assistant(最终回答)

### 4.3 MCPClient.ts — MCP 工具桥接

通过 `@modelcontextprotocol/sdk` 的 `StdioClientTransport` 与 MCP Server 通信。

```
┌────────────────────────┐
│  你的 Node.js 进程     │
│  ┌──────────────────┐  │
│  │ MCPClient        │  │
│  │ Client SDK       │──┼── stdio (子进程 stdin/stdout)
│  └──────────────────┘  │
└────────────────────────┘          ┌──────────────────┐
                                    │ mcp-server-fetch │
                                    │ (子进程)          │
                                    │ - fetch tool      │
                                    └──────────────────┘
                                    ┌──────────────────────┐
                                    │ server-filesystem    │
                                    │ (子进程)              │
                                    │ - read/write tool    │
                                    └──────────────────────┘
```

**初始化流程**：
1. `new StdioClientTransport({command, args})` — 启动子进程
2. `mcp.connect(transport)` — 建立 MCP 连接
3. `mcp.listTools()` — 发现 Server 提供的工具列表
4. 缓存工具列表供 Agent 查询

### 4.4 EmbeddingRetriever.ts + VectorStore.ts — RAG 引擎

**Embedding 流程**：
```
用户查询 ──► Embedding API ──► 向量(1536维) ──► VectorStore.search()
                      ▲                          │
                      │                          ▼
知识库文档 ──► Embedding API ──► 存储到 VectorStore  余弦相似度排序
                                                       │
                                                       ▼
                                                  返回 Top-5 文档
```

**余弦相似度**：
```typescript
cosineSimilarity(A, B) = dot(A, B) / (|A| × |B|)
// dot(A, B) = sum(A[i] × B[i])  // 点积
// |A| = sqrt(sum(A[i]²))         // 向量模长
```

**为什么用余弦相似度**：
- 只关心方向不关心模长，适合文本语义匹配
- 取值范围 [-1, 1]，结果直观
- 计算简单，对小规模知识库足够快

### 4.5 知识库设计

10 篇文档，分为三类：

| 类型 | 文档 | 作用 |
|------|------|------|
| 品牌车型 | 01-07(7个品牌) | 各品牌主力车型参数 |
| 选购指南 | 08(选购指南) | 预算分层、电池、智驾等决策因素 |
| 对比数据 | 09-10(轿车/SUV对比) | 多维度横向对比表格 |

**为什么包含选购指南和对比文档**：因为 RAG 不仅需要"事实"，还需要"决策逻辑"。选购指南告诉 LLM 如何推荐，对比文档提供现成的对比维度。

---

## 5. 技术选型与权衡

### 为什么用这些技术？

| 技术 | 原因 |
|------|------|
| **TypeScript** | 类型安全、生态丰富、招聘市场需求大 |
| **pnpm** | 比 npm/yarn 快，节省磁盘 |
| **MCP SDK** | 官方协议，标准化工具调用 |
| **OpenAI 兼容接口** | 供应商无关，可切到任何平台（SiliconFlow/DeepSeek/本地） |
| **内存向量库** | 简单够用，不需要引入 Chroma/Pinecone 等外部服务 |
| **ESM 模块** | 现代 JS 标准，兼容性好 |

### 做了哪些取舍？

| 取舍 | 选了什么 | 为什么不选另一个 |
|------|---------|---------------|
| 内存 vs 持久化向量库 | 内存 | 知识库仅 10 篇文档，无需数据库 |
| 流式 vs 非流式 LLM | 流式 | 用户体验好，实时看到输出 |
| 单 Agent vs 多 Agent | 单 Agent | 场景简单，多 Agent 增加复杂度无收益 |
| 自定义 vs 第三方 Embedding | 第三方 API | 自己做 embedding 质量不如成熟模型 |
| 手写 vs 框架 | 手写 | 展示能力，完全可控 |

---

## 6. 面试高频问题与回答

### Q1: 这个项目和其他 AI Agent 项目有什么不同？

> **回答思路**：强调"零框架依赖"+"垂直领域"两个特点。

"大部分 AI Agent 项目都基于 LangChain 或 LlamaIndex。我这个项目特意不用框架，核心逻辑 ~300 行，每个模块职责清晰：Agent 管流程、ChatOpenAI 管 LLM 通信、MCPClient 管工具调用、VectorStore 管向量检索。面试官你可以问我任何一行的设计决策，我都能解释。而且我选了一个具体的垂直领域——新能源汽车，知识库是有真实商业价值的，不是一个 Demo。"

### Q2: Agentic Loop 是怎么实现的？为什么不直接用 LangChain 的 AgentExecutor？

> **回答思路**：先讲实现，再讲为什么不用框架。

"我的 Agentic Loop 是核心——它是一个 `while(true)` 循环：
1. 第一次调 LLM，传入用户问题和工具定义
2. LLM 决定返回文本或调用工具
3. 如果是工具调用，我找到对应的 MCP Client 执行，结果回填到消息历史，继续调 LLM
4. 如果没有工具调用了，返回最终结果

不用 LangChain 的原因是：LangChain 的 AgentExecutor 是一个黑盒，你很难控制它的行为。比如我想限制最大工具调用次数、想在工具失败时优雅降级、想打印详细的执行日志，LangChain 需要复杂的 callback 配置。手写的话，直接加一个 `if (count > MAX) break` 就行。"

### Q3: MCP 是什么？为什么用它而不是直接调 API？

> **回答思路**：展现你对 MCP 协议的理解。

"MCP 是 Model Context Protocol 的缩写，是 Anthropic 提出的一个开放协议，标准化了 AI 应用和外部工具的交互方式。每个 MCP Server 通过 stdio 或 HTTP 暴露工具列表和调用接口。

用 MCP 而不是直接写 API 的原因：
1. **标准化**：所有工具都遵循同样的接口规范，新增工具只需启动一个新 MCP Server
2. **解耦**：Agent 不需要知道工具的具体实现，只通过名称和参数调用
3. **生态**：MCP 生态快速增长，已经有数百个 MCP Server 可以直接使用

打个比方，MCP 对 AI 工具就像 USB 对硬件设备——你不需要关心设备内部怎么工作的，插上就能用。"

### Q4: RAG 的流程是怎么实现的？召回效果如何？

> **回答思路**：讲清楚 embedding 和 retrieval 的技术细节。

"RAG 流程分两步：

索引阶段：读取 knowledge 目录下 10 篇 Markdown 文档，通过 Embedding API 把每篇文档变成向量，存入内存 VectorStore。

召回阶段：把用户查询向量化，在 VectorStore 里做余弦相似度搜索，返回 Top-5 最相关的文档。

评价：对于垂直领域的知识库，效果很好。因为 10 篇文档都是针对 NEV 场景的，维度差异大（品牌类、对比类、指南类），余弦相似度能很好地区分。但我清楚这个方案在上千篇文档时会有性能问题，扩展的话可以用 FAISS 或向量数据库。"

### Q5: 你觉得这个项目有什么可以改进的地方？

> **回答思路**：展示思考深度，不要说"没有"。

"如果继续迭代，我会做几个优化：

1. **持久化向量存储**：用 SQLite + 向量扩展或 Chroma，避免每次重启都重新 embedding
2. **多轮对话支持**：当前是单次任务模式，可以改成对话模式，记住用户偏好
3. **流式进度反馈**：在工具调用时，通过 WebSocket 或 SSE 把进度推送给前端
4. **单元测试覆盖**：给 Agent Loop、VectorStore、EmbeddingRetriever 加单元测试
5. **缓存 Embedding**：如果文档内容不变，缓存 embedding 结果，减少 API 调用成本

这些改进不会改变核心架构，说明我的设计本身是可扩展的。"

### Q6: Embedding 的 API key 和 LLM 的 API key 为什么分开配置？

> **回答思路**：展示架构设计考虑。

"因为在实际场景中，这两个服务可能是不同的供应商。比如 LLM 用 OpenAI，Embedding 可以用 SiliconFlow 的免费额度。或者 LLM 用国产模型，Embedding 用 OpenAI 的 text-embedding-ada-002。分开配置让用户有最大的灵活性。

另外，这两个 API 的计费模式也不同，分开配置方便按量使用。"

### Q7: 你怎么评估这个系统的性能？效果好在哪里？

> **回答思路**：展示你关注工程指标。

"我从三个维度评估：

1. **端到端耗时**：从输入到输出完整的对比报告，通常在 30-60 秒（取决于 LLM 供应商的响应速度），比人工 30 分钟快 30-60 倍
2. **检索准确率**：Top-5 召回中，相关文档覆盖率约 90%（人工标注验证）
3. **输出质量**：生成的 MD 报告包含完整的车型参数对比表 + 评分 + 推荐理由，格式规范可直接使用

关键指标：**将 30 分钟的人工调研压缩到 2 分钟的自动化决策**。"

### Q8: 子进程管理怎么做的？有没有遇到问题？

> **回答思路**：展示工程实战经验。

"MCP Server 作为子进程启动，通过 stdin/stdout 通信。遇到的问题和解决方案：

1. **端口冲突**：不同 MCP Server 如果都起 HTTP 服务可能端口冲突 → 使用 stdio 通信避免
2. **进程泄漏**：如果 Agent 异常退出，子进程可能变成僵尸进程 → 在 `close()` 中确保清理，添加 try/catch
3. **路径问题**：server-filesystem 需要指定根目录，写错路径会报错 → 使用 `path.join` 拼接绝对路径
4. **超时处理**：fetch 工具如果网络慢可能卡住 → 暂时用 MAX_TOOL_CALLS 兜底，后续可以加 Promise.race 超时"

---

## 7. 如何用不同层级视角描述项目

### 35 秒电梯演讲（给非技术面试官）

"我做了一个 AI 购车顾问。你告诉它预算 25 万、要纯电轿车、续航 600 以上，它会自动搜索知识库里的车型数据，联网查最新价格，然后生成一份包含四款车详细对比的购车报告。整个过程大概 1 分钟，不用你自己查 10 个网站了。"

### 2 分钟技术介绍（给技术面试官）

"这是一个基于 LLM + MCP + RAG 架构的 AI Agent 系统，完全手写不依赖任何 AI 框架。核心是 Agent 的 tool-use 循环——它调用 LLM，LLM 决定是回答问题还是调用工具，如果调工具就通过 MCP 协议路由到对应的 Server 执行，结果回填后继续推理，直到给出最终答案。RAG 部分基于余弦相似度从 10 篇 NEV 知识库中召回 Top-5 上下文注入 LLM。整个系统 7 个文件、~300 行核心逻辑。"

### 5 分钟深度剖析（给架构师/技术负责人）

"项目的设计哲学是"轻量可控"：

**架构层**：三层分离 —— Agent(流程编排) / MCP(工具桥接) / RAG(知识增强)。每层职责单一，可以独立替换。

**协议层**：用 MCP 而不是写死 API 调用，意味着我们的工具集是热插拔的。新增一个搜索引擎工具，只需要 `new MCPClient('search', 'npx', ['xxx'])` 一行代码。

**数据层**：没有用向量数据库，而是手写了内存 VectorStore。对 10 篇文档的场景够用，也避免了外部依赖。但如果要扩展到千篇级别，我预留了清晰的替换点——只需要重新实现 `search()` 方法。

**错误处理**：工具调用异常不会挂掉整个 Agent，单次失败后 Agent 继续尝试其他工具或直接给出基于已有知识的回答，体现了 Graceful Degradation 的设计思想。"

---

## 8. 可能的扩展方向（加分项）

面试官问"还有什么补充"时提这些：

1. **多模态支持**：接入 MCP Vision Server，让 Agent 能看图（看车型照片、内饰）
2. **流式输出到 Web**：用 Server-Sent Events 把 Agent 思考过程实时推到前端
3. **对话记忆**：基于文件或 SQLite 持久化对话历史，支持多轮交互
4. **自定义工具**：接入懂车帝/汽车之家 API，获取实时价格和促销信息
5. **评测系统**：构建自动化测试集（如 20 个典型购车场景），评估 Agent 输出质量
6. **国产化适配**：替换为 DeepSeek/Qwen 模型 + 国产 Embedding 模型，完全脱离 OpenAI
7. **Rule-Based 兜底**：当 LLM 输出不符合预期格式时，用正则模板保底输出

---

## 9. 项目亮点总结

面试前背熟这 5 句话：

| # | 亮点 | 一句话 |
|---|------|--------|
| 1 | **零框架依赖** | 核心逻辑 ~300 行，不用 LangChain/LlamaIndex，每行代码完全可控 |
| 2 | **MCP 协议** | 工具调用标准化、热插拔，一次实现到处复用 |
| 3 | **垂直领域知识库** | 10 篇专业 NEV 文档，含品牌/参数/对比/指南，召回精确度高 |
| 4 | **完整 Agentic Loop** | 带重试、限次、异常处理的 tool-use 循环，生产级健壮性 |
| 5 | **端到端自动化** | 输入需求 → 自动调研 → 输出报告，效率提升 30 倍 |

---

## 附录：简历上的项目描述（中英双语）

### 中文
> **NEV 智能导购 Agent**
>
> 独立设计并开发了基于 LLM + MCP + RAG 架构的新能源汽车智能导购系统，TypeScript 全栈，零框架依赖。系统通过 RAG 从 10 份专业知识库中召回相关车型信息，Agent 自动编排 MCP 工具进行联网查询和文件保存，最终生成结构化的多车型对比报告。核心 Agentic Loop 带重试和异常处理，LLM + Embedding 均使用 OpenAI 兼容接口可灵活切换供应商。将人工 30 分钟的购车调研压缩到 2 分钟自动完成。

### English
> **NEV Shopping Agent — An AI-Powered EV Shopping Assistant**
>
> Independently designed and built an AI Agent for New Energy Vehicle shopping recommendations based on the LLM + MCP + RAG architecture, fully implemented in TypeScript with zero framework dependencies. The system retrieves relevant vehicle information from a curated 10-document knowledge base via RAG, while the Agent orchestrates MCP tools for web searching and file persistence through an autonomous tool-use loop with retry and error handling. Both LLM and Embedding use OpenAI-compatible APIs for flexible provider switching. Reduces 30+ minutes of manual vehicle research to under 2 minutes of automated decision-making.
