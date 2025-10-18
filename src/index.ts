// Define the environment interface
export interface Env {
  AI: any; // Cloudflare AI binding
  AIAgent: DurableObjectNamespace;
}

// Define the agent state interface
interface ChatState {
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  sessionId: string;
  lastActivity: string;
}

// Chat Agent class as Durable Object
export class ChatAgent {
  private state: DurableObjectState;
  private env: Env;
  private chatState: ChatState;
  private activeConnections: Map<string, WebSocket>;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.chatState = {
      messages: [],
      sessionId: '',
      lastActivity: new Date().toISOString(),
    };
    this.activeConnections = new Map();
  }

  // Initialize the agent
  async initialize() {
    // Load existing state or initialize new
    const stored = await this.state.storage.get<ChatState>('chatState');
    if (stored) {
      this.chatState = stored;
    } else {
      // Initialize new session
      this.chatState.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await this.saveState();
    }
  }

  // Save state to storage
  private async saveState() {
    await this.state.storage.put('chatState', this.chatState);
  }

  // Handle HTTP requests
  async fetch(request: Request): Promise<Response> {
    await this.initialize();
    
    const url = new URL(request.url);
    
    // Health check endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        sessionId: this.chatState.sessionId,
        messageCount: this.chatState.messages.length,
        lastActivity: this.chatState.lastActivity,
        activeConnections: this.activeConnections.size,
        connectionIds: Array.from(this.activeConnections.keys()),
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // WebSocket upgrade endpoint
    if (url.pathname === '/ws') {
      return this.handleWebSocketUpgrade(request);
    }

    // Default response
    return new Response('TourCraft AI Agent is running!', {
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  // Handle WebSocket connections
  private async handleWebSocket(websocket: WebSocket, request: Request) {
    // Generate unique connection ID
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[${connectionId}] WebSocket connection established`);
    
    // Track this connection
    this.activeConnections.set(connectionId, websocket);
    
    websocket.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(`[${connectionId}] Received message:`, data);

        if (data.type === 'message' && data.content) {
          await this.handleUserMessage(websocket, data.content, connectionId);
        } else if (data.type === 'ping') {
          // Respond to ping with pong to keep connection alive
          websocket.send(JSON.stringify({ type: 'pong' }));
          console.log(`[${connectionId}] Responded to ping`);
        }
      } catch (error) {
        console.error(`[${connectionId}] Error processing WebSocket message:`, error);
        websocket.send(JSON.stringify({
          type: 'error',
          content: 'Invalid message format'
        }));
      }
    });

    websocket.addEventListener('close', (event) => {
      console.log(`[${connectionId}] WebSocket connection closed (code: ${event.code})`);
      // Remove from active connections
      this.activeConnections.delete(connectionId);
      console.log(`Active connections: ${this.activeConnections.size}`);
    });

    websocket.addEventListener('error', (error) => {
      console.error(`[${connectionId}] WebSocket error:`, error);
      // Remove from active connections on error
      this.activeConnections.delete(connectionId);
    });

    // Send welcome message only to this specific connection
    websocket.send(JSON.stringify({
      type: 'message',
      content: 'Welcome to TourCraft AI Assistant! I\'m here to help you plan amazing tours. What would you like to know?'
    }));
    
    console.log(`[${connectionId}] Welcome message sent. Active connections: ${this.activeConnections.size}`);
  }

  // Handle user messages and generate AI responses
  private async handleUserMessage(websocket: WebSocket, userMessage: string, connectionId: string) {
    try {
      console.log(`[${connectionId}] Processing user message: "${userMessage}"`);
      
      // Add user message to state
      const userMsg = {
        id: `msg_${Date.now()}_user`,
        role: 'user' as const,
        content: userMessage,
        timestamp: new Date().toISOString(),
      };

      this.chatState.messages.push(userMsg);
      this.chatState.lastActivity = new Date().toISOString();

      // Generate AI response using Llama model
      const aiResponse = await this.generateAIResponse(userMessage);

      // Add AI response to state
      const aiMsg = {
        id: `msg_${Date.now()}_ai`,
        role: 'assistant' as const,
        content: aiResponse,
        timestamp: new Date().toISOString(),
      };

      this.chatState.messages.push(aiMsg);
      this.chatState.lastActivity = new Date().toISOString();

      // Save state
      await this.saveState();

      // Send AI response to WebSocket
      websocket.send(JSON.stringify({
        type: 'message',
        content: aiResponse
      }));

      console.log(`[${connectionId}] AI response sent: "${aiResponse.substring(0, 50)}..."`);

    } catch (error) {
      console.error(`[${connectionId}] Error handling user message:`, error);
      websocket.send(JSON.stringify({
        type: 'error',
        content: 'Sorry, I encountered an error processing your message. Please try again.'
      }));
    }
  }

  // Generate AI response using Cloudflare AI
  private async generateAIResponse(userMessage: string): Promise<string> {
    try {
      // Prepare conversation context
      const conversationHistory = this.chatState.messages
        .slice(-10) // Keep last 10 messages for context
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n');

      // Create system prompt for TourCraft
      const systemPrompt = `You are TourCraft, an AI assistant specialized in helping music managers and artists plan tours. You have expertise in:

- Tour planning and logistics
- Music industry trends and analytics
- Venue recommendations and booking
- Travel coordination and scheduling
- Band member coordination
- Marketing and promotion strategies
- Budget planning and cost optimization

You should be helpful, professional, and provide actionable advice. Keep responses concise but informative. If you don't know something specific, offer to help research it or suggest alternatives.

Current conversation context:
${conversationHistory}

User's latest message: ${userMessage}`;

      // Call the AI model
      const response = await this.env.AI.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userMessage
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
      });

      return response.response || 'I apologize, but I couldn\'t generate a response at this time. Please try again.';

    } catch (error) {
      console.error('Error generating AI response:', error);
      
      // Fallback responses for common tour planning topics
      const fallbackResponses = [
        "I'd be happy to help you plan your tour! Could you tell me more about your specific needs?",
        "That's a great question about tour planning. Let me help you with that.",
        "I can assist you with tour logistics, venue recommendations, or band coordination. What would you like to focus on?",
        "Tour planning can be complex, but I'm here to help make it easier. What's your main concern?",
      ];

      return fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
    }
  }

  // Handle WebSocket upgrade
  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');
    
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    // Accept the WebSocket connection
    server.accept();

    // Handle the WebSocket connection
    await this.handleWebSocket(server, request);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
}

// Export the agent as default
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Get or create the chat agent
    const id = env.AIAgent.idFromName('tourcraft-chat');
    const agent = env.AIAgent.get(id);
    
    // Handle the request through the agent
    return agent.fetch(request);
  },
} satisfies ExportedHandler<Env>;