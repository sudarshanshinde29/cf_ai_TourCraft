import { useState, useEffect, useCallback, useRef } from 'react';

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
  const [state, setState] = useState<AgentState>({
    isConnected: false,
    isConnecting: false,
    messages: [],
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const messageIdCounter = useRef(0);

  // Generate unique message ID
  const generateMessageId = useCallback(() => {
    return `msg_${Date.now()}_${++messageIdCounter.current}`;
  }, []);

  // Add message to state
  const addMessage = useCallback((message: Omit<AgentMessage, 'id'>) => {
    const newMessage: AgentMessage = {
      ...message,
      id: generateMessageId(),
    };
    
    setState(prev => ({
      ...prev,
      messages: [...prev.messages, newMessage],
    }));
  }, [generateMessageId]);

  // Handle WebSocket connection
  const connect = useCallback(() => {
    // Prevent multiple simultaneous connections
    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      console.log('WebSocket already connected or connecting, skipping...');
      return;
    }

    // Clear any existing reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      // Use provided worker URL or auto-detect based on environment
      const url = workerUrl || (window.location.hostname === 'localhost' 
        ? 'ws://localhost:8787/ws' 
        : 'wss://tourcraft.sshinde5.workers.dev/ws');
      console.log('Attempting to connect to:', url);
      wsRef.current = new WebSocket(url);

      wsRef.current.onopen = () => {
        setState(prev => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
          error: null,
        }));
        
        console.log('WebSocket connected successfully');
        
        // Start heartbeat to keep connection alive
        heartbeatIntervalRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000); // Send ping every 30 seconds
        
        // Note: Welcome message is now sent by the backend only
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'message' && data.content) {
            addMessage({
              type: 'agent',
              content: data.content,
              timestamp: new Date(),
            });
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          addMessage({
            type: 'agent',
            content: 'Sorry, I received an invalid message. Please try again.',
            timestamp: new Date(),
          });
        }
      };

      wsRef.current.onclose = (event) => {
        console.log(`WebSocket closed with code: ${event.code}, reason: ${event.reason}`);
        
        // Clear heartbeat interval
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        
        setState(prev => ({
          ...prev,
          isConnected: false,
          isConnecting: false,
        }));

        // Only attempt to reconnect if it wasn't a manual disconnect (code 1000)
        // and if we're not already trying to reconnect
        if (event.code !== 1000 && !reconnectTimeoutRef.current) {
          console.log('Scheduling reconnection in 3 seconds...');
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('Attempting to reconnect...');
            reconnectTimeoutRef.current = null;
            connect();
          }, 3000);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setState(prev => ({
          ...prev,
          isConnecting: false,
          error: 'Failed to connect to TourCraft AI Assistant',
        }));
      };

    } catch (error) {
      console.error('Error creating WebSocket connection:', error);
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: 'Failed to create connection',
      }));
    }
  }, [workerUrl, addMessage]);

  // Disconnect WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }

    setState(prev => ({
      ...prev,
      isConnected: false,
      isConnecting: false,
    }));
  }, []);

  // Send message to agent
  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setState(prev => ({
        ...prev,
        error: 'Not connected to agent. Please connect first.',
      }));
      return;
    }

    // Add user message to state
    addMessage({
      type: 'user',
      content,
      timestamp: new Date(),
    });

    // Send message to WebSocket
    try {
      wsRef.current.send(JSON.stringify({
        type: 'message',
        content,
        timestamp: new Date().toISOString(),
      }));
    } catch (error) {
      console.error('Error sending message:', error);
      setState(prev => ({
        ...prev,
        error: 'Failed to send message',
      }));
    }
  }, [addMessage]);

  // Clear all messages
  const clearMessages = useCallback(() => {
    setState(prev => ({
      ...prev,
      messages: [],
    }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    state,
    sendMessage,
    connect,
    disconnect,
    clearMessages,
  };
};
