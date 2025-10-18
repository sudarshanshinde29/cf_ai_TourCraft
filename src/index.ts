import { AIChatAgent } from "agents/ai-chat-agent";
import { StreamTextOnFinishCallback, ToolSet, streamText, createUIMessageStream, convertToModelMessages, createUIMessageStreamResponse } from "ai";
import { createWorkersAI } from 'workers-ai-provider';
import { routeAgentRequest } from "agents";

// Define the environment interface
export interface Env {
  AI: any; // Cloudflare AI binding
  ChatAgent: DurableObjectNamespace;
}


// Chat Agent class extending AIChatAgent from agents package
export class ChatAgent extends AIChatAgent<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
  }

  /**
   * Handle incoming chat messages and generate AI responses
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // Initialize the model with the environment
    const workersai = createWorkersAI({ binding: this.env.AI });
    const model = workersai("@cf/meta/llama-3-8b-instruct");

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const result = streamText({
          system: `You are TourCraft, an AI assistant specialized in helping music managers and artists plan tours. You have expertise in:

- Tour planning and logistics
- Music industry trends and analytics
- Venue recommendations and booking
- Travel coordination and scheduling
- Band member coordination
- Marketing and promotion strategies
- Budget planning and cost optimization

You should be helpful, professional, and provide actionable advice. Keep responses concise but informative. If you don't know something specific, offer to help research it or suggest alternatives.`,

          messages: convertToModelMessages(this.messages),
          model,
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<{}>,
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
    
    // Add CORS headers for all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    
    // Handle preflight OPTIONS requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { 
        status: 200, 
        headers: corsHeaders 
      });
    }
    
    // Handle agent routing using the proper agents library function
    if (url.pathname.startsWith('/agents/')) {
      try {
        const response = await routeAgentRequest(request, env);
        
        // For WebSocket upgrades (status 101), return the response as-is
        if (response && response.status === 101) {
          return response;
        }
        
        // For HTTP responses, add CORS headers
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
        
        // If no response, return error
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
    
    // Default response
    return Response.json({ msg: 'no agent here' }, { 
      status: 404, 
      headers: corsHeaders 
    });
  },
} satisfies ExportedHandler<Env>;