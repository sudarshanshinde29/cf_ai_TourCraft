import { useState, useCallback } from 'react';
// @ts-ignore
import { useAgent as useAgentHook } from 'agents/react';
// @ts-ignore
import { useAgentChat } from 'agents/ai-react';
// @ts-ignore
import type { UIMessage } from '@ai-sdk/react';

export interface AgentMessage {
  id: string;
  type: 'user' | 'agent';
  content: string;
  timestamp: Date;
  toolEvent?: {
    name: string;
    callId?: string;
    outputPreview?: string;
  };
}

export interface AgentState {
  isConnected: boolean;
  isConnecting: boolean;
  messages: AgentMessage[];
  error: string | null;
}

export interface UseAgentReturn {
  state: AgentState;
  sendMessage: (content: string) => void;
  connect: () => void;
  disconnect: () => void;
  clearMessages: () => void;
}

export const useAgent = (workerUrl?: string): UseAgentReturn => {
  const [error, setError] = useState<string | null>(null);

  // Use the agents/react hook to connect to our ChatAgent
  const agent = useAgentHook({
    agent: "ChatAgent",
    name: "tourcraft-chat",
    host: workerUrl || (window.location.hostname === 'localhost' 
      ? 'localhost:8787' 
      : 'tourcraft.sshinde5.workers.dev'),
  });

  // Use the useAgentChat hook with the agent connection
  const {
    messages: agentMessages,
    clearHistory,
    status,
    sendMessage: sendAgentMessage,
    stop
  } = useAgentChat<unknown, UIMessage<{ createdAt: string }>>({
    agent
  });

  // Convert agent messages to our format
  // agentMessages is an array of UIMessage objects
  const convertedMessages: AgentMessage[] = Array.isArray(agentMessages)
    ? agentMessages.map((msg: any) => {
        // Extract content from different message formats, including tool outputs
        let content = '';
        let toolEvent: AgentMessage['toolEvent'] | undefined;
        if (Array.isArray(msg.parts)) {
          // Find any tool-related part first so we can render a tool chip even if assistant text exists
          const toolPart = msg.parts.find((p: any) =>
            p && (p.type === 'tool-result' || p.type === 'tool-output' || p.type === 'tool-output-available')
          );
          if (toolPart) {
            try {
              const derived =
                typeof toolPart.text === 'string'
                  ? toolPart.text
                  : typeof toolPart.output === 'string'
                    ? toolPart.output
                    : toolPart.output && typeof toolPart.output.text === 'string'
                      ? toolPart.output.text
                      : '';
              const name = toolPart.toolName || toolPart.name || 'tool';
              const callId = toolPart.toolCallId || toolPart.id;
              const preview = derived ? String(derived).slice(0, 120) : undefined;
              toolEvent = { name, callId, outputPreview: preview };
              // If we have no other content, use the derived tool text as content
              if (!content && derived) content = derived;
            } catch {}
          }

          // Prefer assistant plain text for the bubble text, but keep toolEvent if present
          const textPart = msg.parts.find((p: any) => p?.type === 'text' && typeof p.text === 'string');
          if (textPart) content = textPart.text || content;

          // 3) Last resort: look for any part object with a 'text' field
          if (!content) {
            const anyText = msg.parts.find((p: any) => p && typeof p.text === 'string');
            if (anyText) content = anyText.text;
          }
        } else if (msg.content) {
          content = msg.content;
        }

        return {
          id: msg.id || `msg_${Date.now()}_${msg.role}`,
          type: msg.role === 'user' ? 'user' : 'agent',
          content,
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
          toolEvent
        };
      })
    : [];

  // Connect to agent
  const connect = useCallback(async () => {
    try {
      setError(null);
      // The agent connects automatically when the hook is used
    } catch (error) {
      console.error('Error connecting to agent:', error);
      setError('Failed to connect to agent');
    }
  }, []);

  // Disconnect from agent
  const disconnect = useCallback(() => {
    try {
      stop();
    } catch (error) {
      console.error('Error disconnecting from agent:', error);
    }
  }, [stop]);

  // Send message to agent
  const sendMessage = useCallback(async (content: string) => {
    try {
      await sendAgentMessage({
        role: "user",
        parts: [{ type: "text", text: content }]
      });
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to send message');
    }
  }, [sendAgentMessage]);

  // Clear all messages
  const clearMessages = useCallback(() => {
    clearHistory();
  }, [clearHistory]);

  const state: AgentState = {
    isConnected: (status as any) !== 'idle',
    isConnecting: (status as any) === 'loading',
    messages: convertedMessages,
    error,
  };

  return {
    state,
    sendMessage,
    connect,
    disconnect,
    clearMessages,
  };
};