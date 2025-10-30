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
  MUSIC_TRENDS_MCP_URL?: string; // Optional MCP base URL (e.g., https://music-trends...workers.dev)
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
         * Initialize MCP client and connect to Music Trends MCP server
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
            const mcpUrl = this.env.MUSIC_TRENDS_MCP_URL || "http://localhost:9000";
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
            console.log("🔌 Creating fresh music-trends connection...");
            const { id, authUrl } = await this.addMcpServer(
              "music-trends",
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
                console.log("✅ Connected to Music Trends MCP server:", id);
                console.log("🎵 MCP tools available:", Object.keys(tools));
              } else {
                // Ensure tools reflect empty on failure
                console.warn("⚠️ MCP connected but no tools discovered within timeout; marking as not ready");
                console.log("🎵 MCP tools available:", []);
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
    const self = this;
    const signal = _options?.abortSignal;
    // Initialize the model with the environment
    // Prefer OpenAI (tool-calling capable) when API key is present; otherwise fallback to Workers AI
    let model: any;
    if (this.env.OPENAI_API_KEY) {
      const openai = createOpenAI({ apiKey: this.env.OPENAI_API_KEY });
      model = openai("gpt-4o-mini");
      console.log("🧠 Using OpenAI model: gpt-4o-mini");
    } else {
      const workersai = createWorkersAI({ binding: this.env.AI });
      model = workersai("@cf/meta/llama-3-8b-instruct");
      console.log("🧠 Using Workers AI model: @cf/meta/llama-3-8b-instruct");
    }

    // Collect all MCP-provided tools (Music Trends server)
    const allTools = this.mcp.getAITools();
    console.log("MCP Client status:", "connected");
    console.log("Underlying MCP tool keys:", Object.keys(allTools));

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
    async function processToolCalls({ messages, writer, signal }: { messages: any[]; writer: any; signal?: AbortSignal }) {
      const processedMessages = await Promise.all(
        (messages || []).map(async (message) => {
          const parts = message?.parts;
          if (!Array.isArray(parts)) return message;

          const processedParts = await Promise.all(
            parts.map(async (part: any) => {
              if (!isToolUIPart(part)) return part;
              // Only emit when tool output is available
              if (part.state !== "output-available") return part;

              if (signal?.aborted) return part;
              // Forward updated tool result to client as a structured event
              try {
                const pAny = part as any;
                const toolName = pAny.toolName || pAny.name || (typeof part.type === 'string' && part.type.startsWith('tool-') ? (part.type as string).slice(5) : undefined) || 'tool';
                // Emit enhanced tool-output-available
                writer?.write?.({
                  type: "tool-output-available",
                  toolCallId: part.toolCallId,
                  output: part.output,
                  toolName
                });
              } catch {}

              // Record minimal tool-call metadata in durable state for history/debug
              try {
                const prior = (self as any).state?.toolCalls || [];
                const pAny = part as any;
                const next = [...prior, { toolName: pAny.toolName || pAny.name || 'tool', toolCallId: part.toolCallId, ts: Date.now() }];
                // @ts-ignore setState provided by base Agent
                self.setState?.({ ...(self as any).state, toolCalls: next });
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
        if (signal?.aborted) return;
        // 1) Normalize message history
        const cleaned = cleanupMessages(this.messages);
        // 2) Resolve any pending tool calls from prior turns and stream their outputs
        const processed = await processToolCalls({ messages: cleaned, writer, signal });

        // Mirror friend's pattern: pass SDK-provided tools (including MCP) straight through
        const allTools = {
          ...this.mcp.getAITools()
        } as ToolSet;

        const result = streamText({
          system: `You are a helpful assistant with access to Music Trends analysis tools.

When users ask about music trends, tour planning, or market insights, use the available tools to analyze and summarize results.

Available tools:
- analyze_music_trends: Analyze current music trends by optional genre, location, and timePeriod (week|month|year).
- get_server_status: Check the health/status of the Music Trends MCP server.

Guidelines:
- Call at most ONE tool per user request, then provide a concise assistant summary.
- Only call a tool if it will materially improve your answer.
- If user asks for "status" or similar, prefer get_server_status.
- If user asks about a specific genre and/or location, prefer analyze_music_trends and pass the inferred parameters.

Examples:
- "Analyze hip-hop in New York" -> call analyze_music_trends({ genre: "hip-hop", location: "New York" })
- "What genres are trending globally?" -> call analyze_music_trends({})
- "Status of your data" -> call get_server_status({})`,

          messages: convertToModelMessages(processed),
          model,
          tools: allTools,
          toolChoice: "auto",
          // Encourage at most one tool call; stop earlier to avoid repeats
          stopWhen: stepCountIs(4),
          // Cancel generation/tool streaming if client disconnects
          abortSignal: signal,
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<ToolSet>,
        });

        if (!signal?.aborted) {
          writer.merge(result.toUIMessageStream());
        }
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