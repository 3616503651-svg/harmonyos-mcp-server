#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import cors from "cors";
import { KnowledgeBaseManager } from "./knowledge-base.js";

const TOOLS = [
  { name: "knowledge_search", description: "搜索知识库", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number", default: 5 } }, required: ["query"] } }
];

const kb = new KnowledgeBaseManager();
const server = new Server({ name: "harmonyos-knowledge-assistant", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const safe = args || {};
  try {
    if (name === "knowledge_search") {
      const results = await kb.search(String(safe.query), Number(safe.limit) || 5);
      let replyText = "未找到相关文档。";
      if (results && results.length > 0) {
        replyText = results.map((r: any) => `标题: ${r.title}\n内容: ${r.content}`).join("\n\n---\n\n");
      }
      return { content: [{ type: "text", text: replyText }] };
    }
    return { content: [{ type: "text", text: "工具调用成功" }] };
  } catch (e: any) {
    return { content: [{ type: "text", text: `错误: ${e.message}` }], isError: true };
  }
});

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// 核心：修复 SSE 连接
let transport: SSEServerTransport | null = null;

app.get("/sse", async (req, res) => {
  console.log("SSE 连接已建立");
  // 每次请求都创建全新 transport，不重用全局变量
  const newTransport = new SSEServerTransport("/messages", res);
  transport = newTransport;
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).json({ error: "无活动 SSE 连接" });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.post("/api/search", async (req, res) => {
  const result = await kb.search(req.body.query, req.body.limit);
  // 关键：显式设置 Content-Type 为 JSON
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  
  if (result && result.length > 0) {
    let textResponse = "";
    for (const item of result) {
      textResponse += `标题：${item.title}\n内容：${item.content}\n\n`;
    }
    // 返回一个标准的 JSON 对象
    res.json({ displayText: textResponse }); 
  } else {
    res.json({ displayText: "未找到相关文档。" });
  }
});
async function main() {
  await kb.initialize();
  app.listen(3000, "0.0.0.0", () => console.log("MCP SSE Server: http://0.0.0.0:3000/sse"));
}
main().catch(console.error);
