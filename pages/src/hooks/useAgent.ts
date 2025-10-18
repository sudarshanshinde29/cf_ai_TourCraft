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
        // Extract content from different message formats
        let content = '';
        if (msg.parts && Array.isArray(msg.parts)) {
          content = msg.parts.find((part: any) => part.type === 'text')?.text || '';
        } else if (msg.content) {
          content = msg.content;
        }
        
        return {
          id: msg.id || `msg_${Date.now()}_${msg.role}`,
          type: msg.role === 'user' ? 'user' : 'agent',
          content: content,
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
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