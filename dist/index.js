#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const sse_js_1 = require("@modelcontextprotocol/sdk/server/sse.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const knowledge_base_js_1 = require("./knowledge-base.js");
const TOOLS = [
    { name: "knowledge_search", description: "搜索知识库", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number", default: 5 } }, required: ["query"] } }
];
const kb = new knowledge_base_js_1.KnowledgeBaseManager();
const server = new index_js_1.Server({ name: "harmonyos-knowledge-assistant", version: "1.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const safe = args || {};
    try {
        if (name === "knowledge_search") {
            const results = await kb.search(String(safe.query), Number(safe.limit) || 5);
            let replyText = "未找到相关文档。";
            if (results && results.length > 0) {
                replyText = results.map((r) => `标题: ${r.title}\n内容: ${r.content}`).join("\n\n---\n\n");
            }
            return { content: [{ type: "text", text: replyText }] };
        }
        return { content: [{ type: "text", text: "工具调用成功" }] };
    }
    catch (e) {
        return { content: [{ type: "text", text: `错误: ${e.message}` }], isError: true };
    }
});
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: "10mb" }));
// 核心：修复 SSE 连接
let transport = null;
app.get("/sse", async (req, res) => {
    console.log("SSE 连接已建立");
    // 每次请求都创建全新 transport，不重用全局变量
    const newTransport = new sse_js_1.SSEServerTransport("/messages", res);
    transport = newTransport;
    await server.connect(transport);
});
app.post("/messages", async (req, res) => {
    if (transport) {
        await transport.handlePostMessage(req, res);
    }
    else {
        res.status(400).json({ error: "无活动 SSE 连接" });
    }
});
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.post("/api/search", async (req, res) => {
    const result = await kb.search(req.body.query, req.body.limit);
    res.json(result);
});
async function main() {
    await kb.initialize();
    app.listen(3000, "0.0.0.0", () => console.log("MCP SSE Server: http://0.0.0.0:3000/sse"));
}
main().catch(console.error);
