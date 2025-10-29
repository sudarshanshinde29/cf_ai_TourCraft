import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ExecutionContext, ExportedHandler, DurableObjectNamespace } from "@cloudflare/workers-types";

interface Env {
  MCP_OBJECT: DurableObjectNamespace;
}

export class SimpleCalculatorMCP extends McpAgent<Env> {
  server = new McpServer({
    name: "Simple Calculator Server",
    version: "1.0.0",
  });

  // Track if tools have been initialized to prevent duplicates
  private toolsInitialized = false;

  // Override the session ID to force singleton behavior
  getSessionId(): string {
    return "singleton-calculator-mcp";
  }

  async init() {
    // For singleton pattern, only initialize once regardless of session
    if (this.toolsInitialized) {
      console.log(`🧮 Tools already initialized for singleton instance, skipping...`);
      return;
    }

    console.log(`🧮 Initializing SINGLETON Simple Calculator MCP Server...`);
    console.log("🧮 Setting up tools...");
    
    // Simple addition tool
    this.server.tool(
      "add",
      {
        a: z.number(),
        b: z.number()
      },
      async ({ a, b }) => {
        console.log("🚀 ===== TOOL CALLED: add =====");
        console.log(`📊 Parameters received: a=${a} (type: ${typeof a}), b=${b} (type: ${typeof b})`);
        console.log(`🧮 Calculating: ${a} + ${b} = ${a + b}`);
        
        const result = a + b;
        const response = {
          content: [{
            type: "text" as const,
            text: `The result of ${a} + ${b} = ${result}`
          }]
        };
        
        console.log(`✅ Returning result:`, JSON.stringify(response));
        console.log("🚀 ===== TOOL CALL COMPLETE =====");
        
        return response;
      }
    );

    // Simple multiplication tool
    this.server.tool(
      "multiply",
      {
        a: z.number(),
        b: z.number()
      },
      async ({ a, b }) => {
        console.log("🚀 ===== TOOL CALLED: multiply =====");
        console.log(`📊 Parameters received: a=${a} (type: ${typeof a}), b=${b} (type: ${typeof b})`);
        console.log(`🧮 Calculating: ${a} * ${b} = ${a * b}`);
        
        const result = a * b;
        const response = {
          content: [{
            type: "text" as const,
            text: `The result of ${a} × ${b} = ${result}`
          }]
        };
        
        console.log(`✅ Returning result:`, JSON.stringify(response));
        console.log("🚀 ===== TOOL CALL COMPLETE =====");
        
        return response;
      }
    );

    this.toolsInitialized = true;
    console.log("🧮 Tools setup complete!");
  }

  /**
   * Handle connection cleanup when client disconnects
   */
  async onConnectionClose() {
    console.log(`🧮 MCP client disconnected from singleton instance, cleaning up...`);
    // Don't reset tools for singleton - keep them initialized
  }
}

// Support both SSE and Streamable HTTP transport methods
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // SSE transport endpoint (for existing MCP clients)
    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return SimpleCalculatorMCP.serveSSE("/sse", {
        binding: "MCP_OBJECT"
      }).fetch(request as any, env, ctx);
    }

    // Streamable HTTP transport endpoint (for new MCP clients)
    if (url.pathname === "/mcp") {
      try {
        return SimpleCalculatorMCP.serve("/mcp", {
          binding: "MCP_OBJECT"
        }).fetch(request as any, env, ctx);
      } catch (error: any) {
        console.error("MCP serve error:", error);
        return Response.json({ 
          error: "MCP server error", 
          details: error.message 
        }, { status: 500 });
      }
    }

    // Health check endpoint
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ 
        status: "healthy", 
        server: "Simple Calculator MCP Server",
        version: "1.0.0",
        tools: ["add", "multiply"]
      }));
    }

    return new Response("Not found", { status: 404 });
  },
} as any;
