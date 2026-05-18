# 小白也能懂的底层原理手册

> 本文档面向编程/ AI 零基础读者，用大白话 + 生活比喻解释项目中所有专有名词。
>
> 读完你可以：① 理解每个术语的本质 ② 知道它们在这个项目里怎么配合 ③ 面试时能用自己的话讲清楚

---

## 目录

1. [LLM — 大语言模型](#1-llm--大语言模型)
2. [Prompt — 提示词](#2-prompt--提示词)
3. [Token — 令牌](#3-token--令牌)
4. [Stream — 流式输出](#4-stream--流式输出)
5. [MCP — 模型上下文协议](#5-mcp--模型上下文协议)
6. [MCP Server / Client — 服务端与客户端](#6-mcp-server--client--服务端与客户端)
7. [Stdio Transport — 标准输入输出通信](#7-stdio-transport--标准输入输出通信)
8. [Tool Call — 工具调用](#8-tool-call--工具调用)
9. [Agent — 智能体](#9-agent--智能体)
10. [Agentic Loop — 智能体循环](#10-agentic-loop--智能体循环)
11. [RAG — 检索增强生成](#11-rag--检索增强生成)
12. [Embedding — 向量化嵌入](#12-embedding--向量化嵌入)
13. [Vector — 向量](#13-vector--向量)
14. [Vector Store — 向量数据库 / 向量存储](#14-vector-store--向量数据库)
15. [Cosine Similarity — 余弦相似度](#15-cosine-similarity--余弦相似度)
16. [Top-K — 取前 K 个](#16-top-k--取前-k-个)
17. [OpenAI 兼容接口](#17-openai-兼容接口)
18. [子进程 (Child Process)](#18-子进程-child-process)
19. [ESM vs CommonJS](#19-esm-vs-commonjs)
20. [总复习：一次完整的请求发生了什么](#20-总复习一次完整的请求发生了什么)

---

## 1. LLM — 大语言模型

### 是什么
LLM = Large Language Model（大语言模型）。本质上是一个**超级会接话的机器**。

### 生活比喻
想象你有一个朋友，他读完了互联网上所有的书、文章、对话。你问他问题，他不是"查找"答案，而是**根据他读过的所有内容，预测最合理的回答**。

比如你问："新能源汽车有什么优点？"
他不会去数据库查，而是想："我读过很多文章说新能源车省油钱、环保、安静…所以回答应该是这些。"

### 项目里用到的
我们用的是 `openai/gpt-4o-mini` —— OpenAI 提供的 GPT-4 的轻量版。它负责两件事：
1. **理解用户需求**（"预算25万，要纯电轿车"）
2. **决定下一步做什么**（直接回答？还是调用工具查价格？）

### 关键特点
- **不是搜索引擎**：它不"查"数据，而是"生成"文本。所以需要 RAG 给它提供真实数据
- **有上下文窗口**：它一次能"记住"的信息量有限（比如 128K tokens）
- **会"幻觉"**：它可能编造看起来合理但实际错误的信息 → 所以我们的 RAG 给它真数据

---

## 2. Prompt — 提示词

### 是什么
你给 LLM 说的话就是 prompt。你可以把它理解为**给 AI 的指令**。

### 生活比喻
就像你给实习生布置任务：
> "帮我查一下这四款车的参数，对比一下优缺点，写一份报告存到文件里。"

你布置得越清楚，实习生干得越好。Prompt 也是一样。

### 项目里的 prompt（在 index.ts 里）
```typescript
const TASK = `
你是一个专业的新能源汽车导购顾问。

用户预算：25万元左右
用户需求：纯电动轿车，续航600km以上...

任务要求：
1. 从知识库检索以上4款车型的详细参数
2. 对比分析每款车型的优劣势
3. ...
`;
```

这个 prompt 包含了：
- **角色设定**（你是导购顾问）
- **用户需求**（预算、车型）
- **具体任务**（检索、对比、保存）
- **格式要求**（Markdown 表格）

### 为什么 prompt 重要？
差的 prompt："帮我看看车"
好的 prompt：上面那个。

LLM 的表现很大程度取决于你会不会"说话"——这叫 **Prompt Engineering**。

---

## 3. Token — 令牌

### 是什么
Token 是 LLM 处理文本的最小单位。可以理解成**词的碎片**。

### 生活比喻
英文中大概 1 个词 = 1-2 个 token
中文中大概 1 个字 = 1-2 个 token

比如 "我喜欢新能源汽车" → 可能被拆成 ["我", "喜欢", "新能源", "汽车"]

### 为什么重要
- **计费**：OpenAI 按 token 收费（输入 + 输出都算钱）
- **限制**：LLM 有最大 token 限制（比如 128K），超过就"记不住"了
- **性能**：token 越多，响应越慢越贵

### 项目里
我们在 Agent 循环里把工具执行结果截断到 2000 字符 → 就是为了省 token，避免撑爆上下文。

---

## 4. Stream — 流式输出

### 是什么
LLM 不是等全部想好了再一次性回答，而是**一个字一个字地往外吐**。

### 生活比喻
正常 API：你问问题 → 等 10 秒 → 一次性收到全部回答
流式 API：你问问题 → 几乎立刻开始收到第一个字 → 字不断蹦出来 → 最后收完

就像看直播 vs 下载完再看。

### 代码里
```typescript
const stream = await this.llm.chat.completions.create({
    stream: true,  // 开启流式
});
for await (const chunk of stream) {
    // chunk 是 AI 刚"想好"的几句话
    process.stdout.write(chunk);  // 实时打印到屏幕
}
```

### 好处
- 用户不用干等，体验好
- 可以实时看到 AI 在"思考"

---

## 5. MCP — 模型上下文协议

### 是什么
MCP = Model Context Protocol。是 Anthropic（Claude 的公司）提出的**开放标准**，定义了 AI 应用怎么跟外部工具通信。

### 生活比喻
想象你的电脑有 USB 接口。不管你是插鼠标、键盘还是 U 盘，接口标准是一样的 —— 插上就能用。

**MCP 就是 AI 世界的 USB 接口标准。**

在没有 MCP 之前：
- 每个 AI 项目要自己写代码调用百度 API
- 另一个项目要再写一遍
- 换一个 AI 模型又要改代码

有了 MCP 之后：
- MCP Server 提供工具（fetch网页、读写文件）
- 任何 MCP Client 都可以直接用这些工具
- 换 AI 模型也不用改工具代码

### 项目里用的两个 MCP Server

| MCP Server | 提供什么工具 | 启动命令 |
|-----------|------------|---------|
| `mcp-server-fetch` | `fetch`（抓取网页内容） | `uvx mcp-server-fetch` |
| `server-filesystem` | `read_file`, `write_file`（读写文件） | `npx -y @modelcontextprotocol/server-filesystem ./output` |

### 核心技术
MCP 通信走 **stdio**（标准输入输出）→ 见下一节。

---

## 6. MCP Server / Client — 服务端与客户端

### 是什么
- **MCP Server**：提供工具的程序。比如 `mcp-server-fetch` 是一个独立进程，它知道怎么抓网页
- **MCP Client**：使用工具的程序。我们的 `MCPClient.ts` 就是 Client

### 生活比喻
MCP Server 就像一个 **专业工具人**：
- 工具人 A 只会"抓网页"
- 工具人 B 只会"读写文件"

MCP Client 就像一个 **项目经理**（Agent），它知道怎么给工具人派活：
> "工具人A，去抓一下特斯拉 Model 3 的价格页面"
> "工具人B，把这份报告保存到文件"

### 项目代码
```typescript
// 创建两个 MCP Server 的客户端连接
const fetchMCP = new MCPClient("fetch-tool", "uvx", ['mcp-server-fetch']);
const fileMCP = new MCPClient("file-tool", "npx", ['-y', '@modelcontextprotocol/server-filesystem', './output']);
```

---

## 7. Stdio Transport — 标准输入输出通信

### 是什么
Stdio = Standard Input/Output（标准输入输出）。

### 生活比喻
打开一个命令行程序（比如 node），你可以：
- 输入文字 → 程序收到（stdin）
- 程序输出文字 → 你看到（stdout）
- 程序报错 → 你看到（stderr）

**MCP 的 Stdio Transport 就是：把这种输入输出当作通信通道。**

### 工作方式
```
你的程序 (Node.js)
    │
    ├── 启动子进程: uvx mcp-server-fetch
    │                   │
    │   写入 stdin ─────→  MCP Server 收到
    │                   │    "帮我抓取 https://xxx.com"
    │                   │
    │   ←─── stdout ────   MCP Server 返回
    │                   │    "网页内容是..."
    │
    └── 读取 stdout，拿到结果
```

### 代码里
```typescript
this.transport = new StdioClientTransport({
    command: "uvx",              // 启动命令
    args: ["mcp-server-fetch"],  // 参数
});
// 这行代码会: 启动一个子进程 "uvx mcp-server-fetch"
// 然后通过 stdin/stdout 跟它通信
```

---

## 8. Tool Call — 工具调用

### 是什么
当 LLM 觉得"这个问题我需要用工具才能回答"时，它不会直接回答，而是返回一个**工具调用请求**。

### 生活比喻
你问助手："特斯拉 Model 3 现在多少钱？"

助手有两种选择：
- **直接回答**："大概 24.59 万起"（如果他知道）
- **请求用工具**："我查一下最新价格..."

Tool Call 就是 LLM 说"帮我查一下"的这个动作。

### 项目里的完整流程
```
1. LLM 收到："帮我对比四款车"
2. LLM 想："我需要具体参数 → 我该从知识库拿"
   返回: tool_call { name: "fetch", args: { url: "..." } }

3. Agent 收到 tool_call → 找到 MCP Server 执行
   返回: "Model 3 后驱版 24.59万起..."

4. Agent 把结果喂给 LLM
   LLM 继续推理

5. LLM 想："参数够了，我写报告吧"
   返回: tool_call { name: "write_file", args: { path: "...", content: "..." } }

6. Agent 执行 → 文件保存成功

7. LLM 没有更多 tool_call 了
   返回: "报告已生成！"
```

### Tool Call 的数据结构（从 API 返回的）
```json
{
  "id": "call_abc123",
  "function": {
    "name": "fetch",
    "arguments": "{\"url\": \"https://xxx.com\"}"
  }
}
```

---

## 9. Agent — 智能体

### 是什么
Agent（智能体）是一个程序，它**自主决定做什么、怎么做**。在我们的项目里，Agent 是大脑。

### 生活比喻
想象你有一个**超级助理**，你只需要说一句：
>"帮我看看 25 万预算买什么纯电轿车好"

助理会自己：
1. 翻资料（RAG 检索知识库）
2. 上网查（调用 fetch MCP）
3. 对比分析（LLM 推理）
4. 写报告（调用 filesystem MCP 保存）

**你不需要告诉他每一步怎么做，他自己决定。**

### Agent 的核心能力
- **感知**：接收用户输入、工具返回的结果
- **决策**：判断下一步该干什么（直接回答？调工具？）
- **行动**：执行工具调用
- **记忆**：记住对话历史（messages 数组）

### 我们的 Agent 类
```typescript
class Agent {
    mcpClients: MCPClient[];  // 可用的工具
    llm: ChatOpenAI;          // LLM 大脑

    async invoke(prompt) {
        // 三步循环：
        // 1. 问 LLM
        // 2. 如果 LLM 要调工具 → 执行 → 结果回填 → 回到 1
        // 3. 如果 LLM 直接回答 → 返回结果
    }
}
```

---

## 10. Agentic Loop — 智能体循环

### 是什么
Agent 不是只问一次 LLM 就完事了。它可能**问很多次**，每次问的时候携带更多信息。这个"问 → 回答 → 再问 → 再回答"的过程就是 Agentic Loop。

### 形象理解
```
第1轮：Agent 问："用户要对比四款车"
       LLM 答："我需要查一下最新价格 → fetch(url)"

第2轮：Agent 问："查到了，Model 3 24.59万起，海豹 18.98万起..."
       LLM 答："好，价格有了，我来对比分析 → write_file(report.md)"

第3轮：Agent 问："文件保存成功"
       LLM 答："报告已生成，这是总结..."

循环结束 ✅
```

### 项目代码的核心逻辑
```typescript
async invoke(prompt) {
    let response = await this.llm.chat(prompt);  // 第1轮

    while (true) {
        if (response.toolCalls.length > 0) {
            // 执行所有工具
            for (const toolCall of response.toolCalls) {
                const result = await mcp.callTool(...);
                this.llm.appendToolResult(toolCall.id, result);
            }
            // 继续下一轮
            response = await this.llm.chat();
        } else {
            // 没有工具调用了，结束
            return response.content;
        }
    }
}
```

### 安全措施
为了防止 Agent 无限循环（比如 LLM 一直要调工具），我们设置了：
```typescript
const MAX_TOOL_CALLS = 10;  // 最多调 10 次工具
if (this.toolCallCount >= MAX_TOOL_CALLS) break;  // 超了强制结束
```

---

## 11. RAG — 检索增强生成

### 是什么
RAG = Retrieval-Augmented Generation（检索增强生成）。

### 为什么要 RAG？
LLM 有两个大问题：
1. **知识有限**：只学到训练时的数据（比如 GPT-4 的知识截止到 2023 年）
2. **会幻觉**：不确定时会编造答案

RAG 的解决思路：**先查资料，再回答问题**。

### 生活比喻
一个学生考试时：
- **纯 LLM**：闭卷考试，全凭记忆写
- **LLM + RAG**：开卷考试，先翻书找到相关章节，再写答案

哪个准确率高？显然是开卷。

### 项目里的 RAG 流程
```
             ┌──────────────┐
             │  knowledge/   │ ← 10 篇 NEV 文档
             │  01_byd.md   │
             │  02_tesla.md │
             │  ...          │
             └──────┬───────┘
                    │ 读取
                    ▼
          ┌─────────────────┐
          │   Embedding     │ ← 把每篇文档变成"向量"
          │    API          │
          └────────┬────────┘
                   │ 存储
                   ▼
          ┌─────────────────┐
          │   VectorStore   │ ← 存了 10 个向量 + 原文
          └────────┬────────┘
                   │
   用户查询 ──────►│ 相似度搜索
                   │
                   ▼
          ┌─────────────────┐
          │   Top-5 相关文档 │ ← 最相关的 5 篇
          └────────┬────────┘
                   │ 注入
                   ▼
          ┌─────────────────┐
          │   Agent → LLM   │ ← LLM 带着资料回答问题
          └─────────────────┘
```

### 代码里
```typescript
async function retrieveContext() {
    // 1. 读取所有知识文档
    for (const file of files) {
        const content = fs.readFileSync(file);
        // 2. 转成向量存入 VectorStore
        await embeddingRetriever.embedDocument(content);
    }

    // 3. 把用户问题转成向量，搜索最相关文档
    const context = await embeddingRetriever.retrieve(query, 5);
    // 4. 返回 Top-5 文档内容
    return context.join('\n');
}
```

---

## 12. Embedding — 向量化嵌入

### 是什么
Embedding 就是把**文字变成一串数字（向量）**的过程。

### 生活比喻
想象我们要描述水果的"相似度"：
```
苹果 = [甜度: 7, 酸度: 2, 大小: 1]
橙子 = [甜度: 5, 酸度: 4, 大小: 1]
西瓜 = [甜度: 8, 酸度: 1, 大小: 3]
石头 = [硬度: 10, 重量: 5, 味道: 0]
```

用数字描述后，我们可以"计算"：
- 苹果 vs 西瓜 → 比较像（都是水果，甜甜的）
- 苹果 vs 石头 → 完全不像

**Embedding 就是干这个的**：把"比亚迪海豹续航700km"这句话，变成一串数字（比如 1536 个数字）。

### 为什么需要 Embedding？
因为 LLM 看不懂文字，它只看懂数字。Embedding 把文字翻译成 LLM 能理解的"数字语言"。

### 用到的 Embedding 模型
`BAAI/bge-m3` 是北京智源研究院（BAAI）开源的通用 Embedding 模型，能把任何文字变成向量。

### 项目里的流程
```typescript
// 发送文字到 Embedding API
const response = await fetch("https://api.xxx/v1/embeddings", {
    body: JSON.stringify({
        model: "BAAI/bge-m3",
        input: "比亚迪海豹续航700km",
    })
});
const data = await response.json();
// 返回: [0.0123, -0.0456, 0.0789, ...]  ← 1536 个数字
return data.data[0].embedding;
```

---

## 13. Vector — 向量

### 是什么
向量就是**一堆数字排成一排**。比如 `[3, 7, 1, 9, 2]` 就是一个 5 维向量。

### 生活比喻
一维向量：温度 [36.5]
二维向量：坐标 [经度, 纬度]
三维向量：RGB 颜色 [红, 绿, 蓝]
1536 维向量：Embedding 的结果 [维度1, 维度2, ..., 维度1536]

### 为什么用高维向量？
因为一篇文章的"含义"很复杂，需要很多维度才能描述清楚。
- 维度1 可能代表"和汽车相关的程度"
- 维度2 可能代表"和价格相关的程度"
- 维度3 可能代表"和技术相关的程度"
- ...

模型自己"学会"了每个维度的含义，我们不需要理解每个维度代表什么，只需要知道：**含义相似的文字，它们的向量也相似**。

---

## 14. Vector Store — 向量数据库

### 是什么
存向量的地方。我们的 VectorStore 就是在内存里存了一堆 `{向量, 原始文字}` 对。

### 生活比喻
就像一个笔记本，每一页记着：
```
第1页: [0.1, 0.3, ...] ← "比亚迪海豹续航700km"
第2页: [0.2, 0.1, ...] ← "特斯拉Model 3价格24.59万起"
...
```

### 项目代码
```typescript
class VectorStore {
    private vectorStore: VectorStoreItem[] = [];
    // 存储: [{embedding: [0.1, 0.3, ...], document: "比亚迪海豹..."}, ...]

    addEmbedding(embedding, document) {
        this.vectorStore.push({ embedding, document });
    }

    search(queryEmbedding, topK) {
        // 计算每个存储向量和查询向量的"相似度"
        // 返回最相似的 topK 个文档
    }
}
```

---

## 15. Cosine Similarity — 余弦相似度

### 是什么
衡量两个向量"方向是否一致"的数学方法。结果在 -1 到 1 之间：
- **1** → 方向完全一致（语义最相似）
- **0** → 垂直（没关系）
- **-1** → 方向完全相反（语义相反）

### 生活比喻
两个人对电影的喜好：
```
我  = [动作片: 8, 爱情片: 2, 科幻片: 9]
小明 = [动作片: 7, 爱情片: 3, 科幻片: 8]
小红 = [动作片: 1, 爱情片: 9, 科幻片: 2]
```

我和小明 → 相似度高（都爱动作+科幻）
我和小红 → 相似度低（口味完全不同）

余弦相似度就是算这个"口味相似度"的数学公式。

### 数学公式（不用背，理解意思就行）
```
cos(A, B) = (A·B) / (|A| × |B|)

A·B = A[1]×B[1] + A[2]×B[2] + ...  (点积，对应位置相乘再求和)
|A| = sqrt(A[1]² + A[2]² + ...)     (向量的长度)

结果 = 点积 / (长度1 × 长度2)
```

### 项目代码
```typescript
private cosineSimilarity(vecA, vecB) {
    // 1. 点积: 对应位置相乘，再求和
    const dotProduct = vecA.reduce(
        (sum, a, idx) => sum + a * vecB[idx], 0
    );

    // 2. 计算每个向量的长度
    const normA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const normB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));

    // 3. 余弦相似度 = 点积 / (长度1 × 长度2)
    return dotProduct / (normA * normB);
}
```

### 为什么叫"余弦"？
在几何中，两个向量夹角的**余弦值**就是这个公式。θ = 0° 时 cos=1（完全一致），θ=90° 时 cos=0（没关系）。

---

## 16. Top-K — 取前 K 个

### 是什么
在搜索结果中只取**最相关的 K 个**结果。

### 生活比喻
Google 搜索"新能源汽车" → 返回 1 亿条结果。但你只看前 10 条。Top-K 就是"取前 K 个"。

### 项目代码
```typescript
// 搜索，取最相似的 5 篇文档
const context = await embeddingRetriever.retrieve(query, 5);
//                                                        ↑
//                                                   Top-K = 5
```

### 代码内部
```typescript
async search(queryEmbedding, topK = 3) {
    // 1. 计算每个文档的相似度分数
    const scored = this.vectorStore.map(item => ({
        document: item.document,
        score: this.cosineSimilarity(queryEmbedding, item.embedding),
    }));

    // 2. 按分数从高到低排序
    // 3. 取前 topK 个
    return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)              // 只取前 K 个
        .map(item => item.document);
}
```

---

## 17. OpenAI 兼容接口

### 是什么
很多 AI 服务提供商都采用和 OpenAI **一样的 API 格式**。这意味着你只需要改一个 URL，就能切换供应商。

### 生活比喻
就像所有手机都用 Type-C 充电口一样。不管你是小米、华为还是三星，插上 Type-C 线就能充。

### OpenAI 兼容的 API 格式
```typescript
// 这是 OpenAI 的调用方式
const client = new OpenAI({
    apiKey: "sk-xxx",               // 你的密钥
    baseURL: "https://api.openai.com/v1",  // API 地址
});

// 如果换成 SiliconFlow，只需要改：
const client = new OpenAI({
    apiKey: "sf-xxx",               // SiliconFlow 的密钥
    baseURL: "https://api.siliconflow.cn/v1",  // 换成 SiliconFlow 地址
});
```

### 项目里为什么用这个设计？
因为这样**供应商可以灵活切换**：
- 想省钱 → 切到国产模型
- 想用 GPT-4 → 切到 OpenAI
- 想本地部署 → 部署 vLLM 后用本地地址

---

## 18. 子进程 (Child Process)

### 是什么
子进程就是**从一个程序里启动另一个程序**。

### 生活比喻
你正在用微信（主进程），突然点开一个公众号文章 → 微信内置浏览器打开了（子进程）。子进程是独立的，有自己的内存和生命周期。

### 项目里的子进程
```typescript
// 这行代码启动了 MCP Server 作为子进程
this.transport = new StdioClientTransport({
    command: "uvx",
    args: ["mcp-server-fetch"],
});

// 相当于在命令行里手动执行了:
// > uvx mcp-server-fetch
// 然后通过 stdin/stdout 跟它对话
```

### 为什么用子进程？
- **隔离性**：MCP Server 崩溃不会搞挂主程序
- **独立性**：MCP Server 可以用任何语言写（Python/Rust/Node）
- **标准化**：MCP 协议定义好了通信规范

### 注意
子进程需要**手动关闭**，否则会变成"僵尸进程"：
```typescript
async close() {
    for await (const client of this.mcpClients) {
        try {
            await client.close();  // 关闭子进程
        } catch (e) {
            console.error(`关闭失败: ${e}`);
        }
    }
}
```

---

## 19. ESM vs CommonJS

### 是什么
这是 JavaScript 的两种模块系统，决定了你怎么导入/导出代码。

### 生活比喻
- **CommonJS**：像老式图书馆，你要借书必须写纸条：`const book = require('书名')`
- **ESM**：像现代图书馆，你可以直接说：`import book from '书名'`

### 项目用的是 ESM
```json
// package.json
{
    "type": "module"  // ← 这行表示项目用 ESM
}
```

### 区别示例
```typescript
// CommonJS (老方式)
const fs = require('fs');
const express = require('express');

// ESM (新方式，本项目用的)
import fs from 'fs';
import OpenAI from 'openai';
```

ESM 是现代 JavaScript 标准，TypeScript 默认推荐用 ESM。

---

## 20. 总复习：一次完整的请求发生了什么

现在你已经了解了所有概念，让我们把整个过程串起来：

### 你运行 `pnpm dev`

```
┌──────────────────────────────────────────────────────────────────┐
│  第1阶段：启动                                                     │
│                                                                  │
│  1. index.ts 开始运行                                             │
│  2. 创建 fetchMCP (启动 uvx mcp-server-fetch 作为子进程)           │
│  3. 创建 fileMCP (启动 npx server-filesystem 作为子进程)           │
│  4. Agent.init() → MCP Client 连接 MCP Server                    │
│  5. 用 listTools() 发现可用工具                                    │
│     → 发现: fetch（抓网页）, read_file, write_file（读写文件）      │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  第2阶段：RAG 知识召回                                              │
│                                                                  │
│  1. EmbeddingRetriever 读取 knowledge/*.md（10篇 NEV 文档）       │
│  2. 对每篇文档调 Embedding API：                                   │
│     "比亚迪海豹续航700km..." → [0.012, -0.034, ...] 1536维向量     │
│  3. 10个 {向量, 原文} 对存入 VectorStore                          │
│  4. 用户查询也变向量："25万预算纯电轿车对比..."                     │
│  5. VectorStore.search(查询向量, 5)                               │
│     → 余弦相似度计算 → 排序 → 取 Top-5                             │
│  6. 最相关的5篇文档内容拼接成 context                               │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  第3阶段：Agent 循环                                               │
│                                                                  │
│  ┌─ Round 1 ──────────────────────────────────────────────────┐  │
│  │ Agent 把 context + TASK 发给 LLM                           │  │
│  │ LLM 收到: [知识库内容] + "对比四款车并保存报告"               │  │
│  │ LLM 包含工具: fetch, write_file                             │  │
│  │                                                            │  │
│  │ LLM 返回: tool_call → fetch(url) 查 Model 3 最新价格       │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            │                                      │
│  Agent 执行工具: fetch("https://xxx.com/model3")                  │
│  结果: "特斯拉Model 3 焕新版 24.59万起..."                        │
│  回填 LLM                                                        │
│                            │                                      │
│  ┌─ Round 2 ──────────────────────────────────────────────────┐  │
│  │ Agent 再问 LLM                                             │  │
│  │ LLM 已知道价格信息                                           │  │
│  │ LLM 返回: tool_call → write_file("report.md", "对比表格...") │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            │                                      │
│  Agent 执行工具: write_file("nev_shopping_report.md", 报告内容)   │
│  回填：文件保存成功                                               │
│                            │                                      │
│  ┌─ Round 3 ──────────────────────────────────────────────────┐  │
│  │ Agent 再问 LLM                                             │  │
│  │ LLM 已没有工具要调                                           │  │
│  │ LLM 返回: "报告已生成！以下是总结..."                          │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            │                                      │
│  Agent 检测到没有 tool_call → 结束循环                            │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│  第4阶段：收尾                                                     │
│                                                                  │
│  1. Agent 返回最终总结到控制台                                     │
│  2. Agent.close() → 关闭两个 MCP Server 子进程                     │
│  3. 打开 ./output/nev_shopping_report.md 查看完整对比报告           │
└──────────────────────────────────────────────────────────────────┘
```

### 总结：各个组件各司其职

| 组件 | 一句话 | 类比 |
|------|--------|------|
| **LLM** | 大脑，负责理解和生成 | 一个读了很多书的学霸 |
| **Agent** | 项目经理，控制流程 | 一个会分派任务的管理者 |
| **MCP** | 工具的标准接口 | USB 接口标准 |
| **MCP Server** | 具体工具的执行者 | 专业的工具人 |
| **RAG** | 开卷考试的"书" | 参考资料 |
| **Embedding** | 把文字翻译成数字 | 给水果打分 |
| **VectorStore** | 存数字的地方 | 笔记本 |
| **余弦相似度** | 算两段文字多像 | 算两个人的口味相似度 |
| **Agentic Loop** | 反复问直到完成为止 | 和助理反复沟通直到任务做好 |

---

> **下一步**：回到 `INTERVIEW_PREP.md`，你现在应该能看懂里面每一句话了。
> 试着用自己的话解释一遍每个概念，能说清楚就算真懂了。
