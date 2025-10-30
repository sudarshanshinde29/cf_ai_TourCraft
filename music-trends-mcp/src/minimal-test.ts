import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ExecutionContext, ExportedHandler, Request, DurableObjectNamespace } from "@cloudflare/workers-types";

interface Env {
  MusicTrendsMCP: DurableObjectNamespace;
}

// Minimal MCP server for testing
export class MinimalMCP extends McpAgent<Env> {
  server = new McpServer({
    name: "Minimal Test Server",
    version: "1.0.0",
  });

  async init() {
    console.log("🔧 Initializing Minimal MCP Server...");
    
    // Simple test tool
    this.server.tool(
      "test_tool",
      "A simple test tool",
      {},
      async () => {
        console.log("✅ Test tool called successfully!");
        return {
          content: [{
            type: "text",
            text: "Test tool executed successfully!"
          }],
        };
      }
    );
    
    console.log("✅ Minimal MCP Server initialized");
  }
}

// Support both SSE and Streamable HTTP transport methods
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    console.log(`🔍 MCP Request: ${request.method} ${url.pathname}`);

    // Health check endpoint
    if (url.pathname === "/health") {
      return Response.json({ 
        status: "healthy", 
        server: "Minimal MCP Server",
        version: "1.0.0",
        tools: ["test_tool"]
      });
    }

    // SSE transport endpoint
    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      try {
        console.log("📡 Using SSE transport");
        return MinimalMCP.serveSSE("/sse").fetch(request as any, env, ctx);
      } catch (error) {
        console.error("SSE transport error:", error);
        return Response.json({ error: "SSE error", details: error.message }, { status: 500 });
      }
    }

    // Streamable HTTP transport endpoint
    if (url.pathname === "/mcp") {
      try {
        console.log("🌐 Using Streamable HTTP transport");
        return MinimalMCP.serve("/mcp").fetch(request as any, env, ctx);
      } catch (error) {
        console.error("Streamable HTTP transport error:", error);
        return Response.json({ error: "Streamable HTTP error", details: error.message }, { status: 500 });
      }
    }

    return new Response("Not found", { status: 404 });
  },
} as any;
