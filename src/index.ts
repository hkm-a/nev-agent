import MCPClient from "./MCPClient";
import Agent from "./Agent";
import path from "path";
import EmbeddingRetriever from "./EmbeddingRetriever";
import fs from "fs";
import { logTitle } from "./utils";

const outPath = path.join(process.cwd(), 'output');
const TASK = `
你是一个专业的新能源汽车导购顾问。

## 用户需求
请根据你的知识库和联网查询能力，帮助用户完成购车决策。

用户预算：25万元左右
用户需求：纯电动轿车，续航600km以上，智能驾驶功能好，主要通勤+偶尔长途
目标车型候选：比亚迪海豹、特斯拉Model 3、小鹏P7i、极氪007

## 任务要求
1. 从我的知识库中检索以上4款车型的详细参数
2. 对比分析每款车型的优劣势（价格、续航、加速、充电、智驾、空间）
3. 基于用户需求给出推荐排序和理由
4. 使用 fetch 工具查询各车型最新价格或口碑信息（至少查询2个车型的最新价格）
5. 将最终报告保存到 ${outPath}/nev_shopping_report.md
6. 报告格式要求：使用美观的Markdown表格，包含对比维度、各车型表现、评分和结论
`;

const fetchMCP = new MCPClient("mcp-server-fetch", "uvx", ['mcp-server-fetch']);
const fileMCP = new MCPClient("mcp-server-file", "npx", ['-y', '@modelcontextprotocol/server-filesystem', outPath]);

async function main() {
    logTitle('NEV 智能导购 Agent');
    logTitle('知识库召回阶段');
    const context = await retrieveContext();
    logTitle('Agent 推理阶段');
    const agent = new Agent('openai/gpt-4o-mini', [fetchMCP, fileMCP], '', context);
    await agent.init();
    await agent.invoke(TASK);
    logTitle('任务完成');
    await agent.close();
}

main().catch((err) => {
    console.error('Agent 执行失败:', err);
    process.exit(1);
});

async function retrieveContext() {
    const embeddingRetriever = new EmbeddingRetriever("BAAI/bge-m3");
    const knowledgeDir = path.join(process.cwd(), 'knowledge');
    const files = fs.readdirSync(knowledgeDir).sort();
    logTitle(`加载 ${files.length} 份知识文档`);
    for await (const file of files) {
        const content = fs.readFileSync(path.join(knowledgeDir, file), 'utf-8');
        await embeddingRetriever.embedDocument(content);
    }
    const query = "新能源汽车选购 比亚迪海豹 特斯拉Model3 小鹏P7i 极氪007 纯电轿车对比 25万预算";
    const topK = 5;
    const context = (await embeddingRetriever.retrieve(query, topK)).join('\n');
    logTitle('CONTEXT');
    console.log(`召回 ${topK} 篇相关文档，共 ${context.length} 字符`);
    return context;
}
