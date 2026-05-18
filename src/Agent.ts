import MCPClient from "./MCPClient";
import ChatOpenAI from "./ChatOpenAI";
import { logTitle } from "./utils";

const MAX_TOOL_CALLS = 10;

export default class Agent {
    private mcpClients: MCPClient[];
    private llm: ChatOpenAI | null = null;
    private model: string;
    private systemPrompt: string;
    private context: string;
    private toolCallCount: number = 0;

    constructor(model: string, mcpClients: MCPClient[], systemPrompt: string = '', context: string = '') {
        this.mcpClients = mcpClients;
        this.model = model;
        this.systemPrompt = systemPrompt;
        this.context = context;
    }

    async init() {
        logTitle('初始化 MCP 工具');
        for await (const client of this.mcpClients) {
            await client.init();
        }
        const tools = this.mcpClients.flatMap(client => client.getTools());
        const toolNames = tools.map(t => t.name).join(', ');
        console.log(`已加载工具: ${toolNames}`);
        this.llm = new ChatOpenAI(this.model, this.systemPrompt, tools, this.context);
    }

    async close() {
        for await (const client of this.mcpClients) {
            try {
                await client.close();
            } catch (e) {
                console.error(`关闭 MCP 客户端失败: ${e}`);
            }
        }
    }

    async invoke(prompt: string) {
        if (!this.llm) throw new Error('Agent 未初始化，请先调用 init()');
        let response = await this.llm.chat(prompt);
        while (true) {
            if (this.toolCallCount >= MAX_TOOL_CALLS) {
                console.warn(`达到最大工具调用次数(${MAX_TOOL_CALLS})，强制结束`);
                break;
            }
            if (response.toolCalls.length > 0) {
                this.toolCallCount += response.toolCalls.length;
                for (const toolCall of response.toolCalls) {
                    let mcp = this.mcpClients.find(client =>
                        client.getTools().some((t: any) => t.name === toolCall.function.name)
                    );
                    if (mcp) {
                        logTitle(`工具调用 #${this.toolCallCount}`);
                        console.log(`工具: ${toolCall.function.name}`);
                        console.log(`参数: ${toolCall.function.arguments}`);
                        try {
                            const result = await mcp.callTool(
                                toolCall.function.name,
                                JSON.parse(toolCall.function.arguments)
                            );
                            const resultStr = JSON.stringify(result).slice(0, 2000);
                            console.log(`结果: ${resultStr}...`);
                            this.llm.appendToolResult(toolCall.id, JSON.stringify(result));
                        } catch (e: any) {
                            console.error(`工具调用失败: ${e.message}`);
                            this.llm.appendToolResult(toolCall.id, `Error: ${e.message}`);
                        }
                    } else {
                        console.warn(`未找到工具: ${toolCall.function.name}`);
                        this.llm.appendToolResult(toolCall.id, 'Tool not found');
                    }
                }
                response = await this.llm.chat();
                continue;
            }
            console.log('\nAgent 执行完毕，无更多工具调用');
            return response.content;
        }
    }
}
