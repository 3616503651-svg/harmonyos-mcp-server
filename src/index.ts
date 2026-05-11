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
    // 关键修改：将字段名改为 markdown
    res.json({ markdown: textResponse }); 
  } else {
    res.json({ markdown: "未找到相关文档。" });
  }
});

// 终极测试接口：直接返回纯文本
app.get("/test", async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send("这是一段纯文本测试。如果能看到这段话，说明平台链路彻底通了。");
});

// 新增一个全新的接口，专门配合新工具使用
app.post("/api/v1/search", async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // 这里直接返回固定的测试数据，先验证链路
  const fixedResponse = "标题: HarmonyOS完美笔记\n内容: 这是一条100%能被搜索到的测试数据，证明整个链路已通。";
  res.json({ markdown: fixedResponse });
});
async function main() {
  await kb.initialize();
  app.listen(3000, "0.0.0.0", () => console.log("MCP SSE Server: http://0.0.0.0:3000/sse"));
}
main().catch(console.error);


// 纯文本测试接口，不改任何参数，直接返回一句话
app.get("/pure_test", async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send("如果能看到这句话，说明小艺平台能直接读取纯文本响应。");
});
