import { AIChatAgent } from "agents/ai-chat-agent";
import { StreamTextOnFinishCallback, ToolSet, streamText, createUIMessageStream, convertToModelMessages, createUIMessageStreamResponse, stepCountIs, isToolUIPart, tool } from "ai";
import { z } from "zod/v3";
import { createWorkersAI } from 'workers-ai-provider';
import { createOpenAI } from '@ai-sdk/openai';
import { routeAgentRequest } from "agents";
import type { ExecutionContext, ExportedHandler, Request, DurableObjectNamespace } from "@cloudflare/workers-types";

// Define the environment interface
export interface Env {
  AI: any; // Cloudflare AI binding
  ChatAgent: DurableObjectNamespace;
  HOST?: string; // Optional host for callback URLs
  OPENAI_API_KEY?: string; // Optional OpenAI key for direct OpenAI tool-calling tests
}

// Chat Agent class extending AIChatAgent from agents package
export class ChatAgent extends AIChatAgent<Env> {
  // Prevent overlapping MCP connection attempts and racey tool registration
  private isMcpConnecting: boolean = false;
  private mcpConnectGeneration: number = 0;
  
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }


        /**
         * Initialize MCP client and connect to Simple Calculator MCP server
         */
        async onStart() {
          try {
            console.log("🔌 Initializing MCP client...");
            
            // Single-flight guard to avoid concurrent connects
            if (this.isMcpConnecting) {
              console.log("⏳ MCP connect already in progress; skipping duplicate onStart");
              return;
            }
            this.isMcpConnecting = true;
            const connectGen = ++this.mcpConnectGeneration;

            // Check if MCP tools already exist (prevent multiple connections from frontend)
            const existingTools = this.mcp.getAITools();
            if (Object.keys(existingTools).length > 0) {
              console.log("✅ MCP tools already available, skipping initialization");
              console.log("🧮 Existing MCP tools:", Object.keys(existingTools));
              this.isMcpConnecting = false;
              return;
            }
            
            // CLEAR ALL EXISTING MCP CONNECTIONS FIRST
            console.log("🧹 Clearing all existing MCP connections...");
            const mcpState = this.getMcpServers();
            const existingServerIds = Object.keys(mcpState.servers);
            
            if (existingServerIds.length > 0) {
              console.log("🗑️ Found", existingServerIds.length, "existing MCP servers, removing them...");
              for (const serverId of existingServerIds) {
                try {
                  await this.removeMcpServer(serverId);
                  console.log("✅ Removed MCP server:", serverId);
                } catch (error) {
                  console.error("❌ Failed to remove MCP server", serverId, ":", error);
                }
              }
            }
            
            // Also clear all MCP client connections to ensure clean state
            console.log("🧹 Clearing MCP client connections...");
            try {
              await this.mcp.closeAllConnections();
              console.log("✅ Cleared all MCP client connections");
              
              // Wait longer for cleanup to complete
              await new Promise(resolve => setTimeout(resolve, 3000));
              
              // Check if tools are actually cleared
              const toolsAfterClear = this.mcp.getAITools();
              console.log("🔍 Tools after clearing:", Object.keys(toolsAfterClear));
              
              // If tools are still there, try to force a complete refresh
              if (Object.keys(toolsAfterClear).length > 0) {
                console.log("⚠️ Tools still cached, attempting force refresh...");
                // Try to access the internal mcpConnections and clear them manually
                try {
                  // @ts-ignore - accessing private property
                  const mcpConnections = this.mcp.mcpConnections;
                  console.log("🔍 Current mcpConnections keys:", Object.keys(mcpConnections));
                  
                  // Force clear all connections
                  for (const id of Object.keys(mcpConnections)) {
                    delete mcpConnections[id];
                  }
                  console.log("🧹 Force cleared all mcpConnections");
                  
                  // Check again
                  const toolsAfterForceClear = this.mcp.getAITools();
                  console.log("🔍 Tools after force clear:", Object.keys(toolsAfterForceClear));
                } catch (error) {
                  console.error("❌ Failed to force clear mcpConnections:", error);
                }
              }
              
            } catch (error) {
              console.error("❌ Failed to clear MCP client connections:", error);
            }
            
            // Wait a moment for cleanup to complete
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Health-check gate: ensure MCP server is reachable before connect
            const mcpUrl = "http://localhost:9000";
            const sseUrl = `${mcpUrl}/sse`;
            try {
              const healthResp = await fetch(`${mcpUrl}/health`).catch(() => undefined);
              if (!healthResp || !healthResp.ok) {
                console.warn("⚠️ MCP /health not ready; will attempt connect but tool discovery may lag");
              }
            } catch {
              console.warn("⚠️ MCP /health check failed; proceeding to connect");
            }

            // Create a fresh connection
            console.log("🔌 Creating fresh calculator connection...");
            const { id, authUrl } = await this.addMcpServer(
              "calculator",
              sseUrl,
              this.env.HOST || "http://localhost:8787" // callbackHost required
            );

            if (authUrl) {
              console.log("MCP server requires authorization:", authUrl);
            } else {
              // Only report connected after tools are discovered (gate on enumeration)
              const toolsTimeoutMs = 8000;
              const pollIntervalMs = 250;
              const startTs = Date.now();
              let tools: Record<string, unknown> = {};
              while (Date.now() - startTs < toolsTimeoutMs) {
                // Abort if a newer connect cycle started
                if (connectGen !== this.mcpConnectGeneration) {
                  console.log("🛑 Aborted tool wait due to newer MCP connect cycle");
                  break;
                }
                tools = this.mcp.getAITools();
                if (Object.keys(tools).length > 0) {
                  break;
                }
                await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
              }

              if (Object.keys(tools).length > 0 && connectGen === this.mcpConnectGeneration) {
                console.log("✅ Connected to Simple Calculator MCP server:", id);
                console.log("🧮 MCP tools available:", Object.keys(tools));
              } else {
                // Ensure tools reflect empty on failure
                console.warn("⚠️ MCP connected but no tools discovered within timeout; marking as not ready");
                console.log("🧮 MCP tools available:", []);
              }
            }
          } catch (error) {
            console.error("❌ Failed to initialize MCP client:", error);
          } finally {
            this.isMcpConnecting = false;
          }
        }

  /**
   * Handle incoming chat messages and generate AI responses
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // Initialize the model with the environment
    // Prefer OpenAI (tool-calling capable) when API key is present; otherwise fallback to Workers AI
    let model: any;
    if (this.env.OPENAI_API_KEY) {
      const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });
      model = openai("gpt-4o-mini");
      console.log("🧠 Using OpenAI model: gpt-4o-mini");
    } else {
      // const workersai = createWorkersAI({ binding: this.env.AI });
      // // Previous defaults (kept for rollback/reference):
      // // const model = workersai("@cf/meta/llama-3-8b-instruct");
      // // const model = workersai("@cf/deepseek-ai/deepseek-r1-distill-qwen-32b");
      // model = workersai("@cf/meta/llama-3-8b-instruct");
      console.log("🧠 Using Workers AI model: @cf/meta/llama-3-8b-instruct");
    }

    // Collect all MCP-provided tools
    const allTools = this.mcp.getAITools();

    // Locate MCP-provided tools once
    const addKey = Object.keys(allTools).find((k) => /(^|_)add$/.test(k));
    const multiplyKey = Object.keys(allTools).find((k) => /(^|_)multiply$/.test(k));
    const mcpAdd = addKey ? (allTools as any)[addKey] : undefined;
    const mcpMultiply = multiplyKey ? (allTools as any)[multiplyKey] : undefined;

    console.log("MCP Client status:", "connected");
    console.log("Underlying MCP tool keys:", Object.keys(allTools));
    console.log("🔗 Tool key mapping:", { add: addKey, multiply: multiplyKey });

    // Simple cleanup hook: return only defined parts/messages to avoid invalid states
    function cleanupMessages(messages: any[]) {
      return (messages || []).filter(Boolean).map((m) => ({
        ...m,
        parts: Array.isArray(m.parts) ? m.parts.filter(Boolean) : m.parts
      }));
    }

    // Minimal processToolCalls stub (single-pass): we rely on the AI SDK to execute tools
    // during this request; this hook exists to align with the documented pipeline and
    // to handle any pre-existing pending tool calls in messages if needed in future.
    async function processToolCalls({ messages, writer }: { messages: any[]; writer: any }) {
      const processedMessages = await Promise.all(
        (messages || []).map(async (message) => {
          const parts = message?.parts;
          if (!Array.isArray(parts)) return message;

          const processedParts = await Promise.all(
            parts.map(async (part: any) => {
              if (!isToolUIPart(part)) return part;
              // Only emit when tool output is available
              if (part.state !== "output-available") return part;

              // Forward updated tool result to client as a structured event
              try {
                writer?.write?.({
                  type: "tool-output-available",
                  toolCallId: part.toolCallId,
                  output: part.output
                });
              } catch {}

              // Return updated part unchanged (already has output)
              return part;
            })
          );

          return { ...message, parts: processedParts };
        })
      );

      return processedMessages;
    }

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // 1) Normalize message history
        const cleaned = cleanupMessages(this.messages);
        // 2) Resolve any pending tool calls from prior turns and stream their outputs
        const processed = await processToolCalls({ messages: cleaned, writer });

        // Mirror friend's pattern: pass SDK-provided tools (including MCP) straight through
        const allTools = {
          ...this.mcp.getAITools()
        } as ToolSet;

        const result = streamText({
          system: `You are a helpful assistant with access to calculator tools.

When users ask for mathematical calculations, you MUST use the available calculator tools to provide accurate results.

Available tools:
- add: Add two numbers together
- multiply: Multiply two numbers together

Rules for tool usage:
- Call at most ONE tool per user request, then produce a final assistant message.
- Do NOT repeat the same tool call multiple times in the same turn.
- After the tool result is available, summarize the result clearly as assistant text.

Example: If user asks "What is 5 + 3?", call the add tool with a=5 and b=3, then respond with the result as assistant text.`,

          messages: convertToModelMessages(processed),
          model,
          tools: allTools,
          toolChoice: "auto",
          // Encourage at most one tool call; stop earlier to avoid repeats
          stopWhen: stepCountIs(4),
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<ToolSet>,
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }
}

// Export the agent as default
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { 
        status: 200, 
        headers: corsHeaders 
      });
    }
    
    if (url.pathname.startsWith('/agents/')) {
      try {
        const response = await routeAgentRequest(request as any, env);
        
        if (response && response.status === 101) {
          return response;
        }
        
        if (response) {
          const newHeaders = new Headers(response.headers);
          Object.entries(corsHeaders).forEach(([key, value]) => {
            newHeaders.set(key, value);
          });
          
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders
          });
        }
        
        return Response.json({ error: 'No response from agent' }, { 
          status: 500, 
          headers: corsHeaders 
        });
      } catch (error) {
        console.error('Agent routing error:', error);
        return Response.json({ error: 'Agent routing failed' }, { 
          status: 500, 
          headers: corsHeaders 
        });
      }
    }
    
    return Response.json({ msg: 'no agent here' }, { 
      status: 404, 
      headers: corsHeaders 
    });
  },
} as ExportedHandler<Env>;