import React, { useState, useRef, useEffect } from 'react';
import { useAgent } from '../hooks/useAgent';
import './ChatInterface.css';
// Very small markdown renderer for headings, bold, and line breaks
function renderMarkdown(md: string) {
  let html = md
    // Headings ###
    .replace(/^###\s(.+)$/gm, '<h3>$1</h3>')
    // Bold **text**
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Convert lines to paragraphs (keep existing block tags intact)
    .split('\n')
    .map((line) => (line.trim().startsWith('<h3>') ? line : line.trim().length ? `<p>${line}</p>` : ''))
    .join('');
  return { __html: html };
}


interface ChatInterfaceProps {
  workerUrl?: string;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ workerUrl }) => {
  const { state, sendMessage, connect, disconnect, clearMessages } = useAgent(workerUrl);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  // Auto-connect on component mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && state.isConnected) {
      sendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const formatTime = (timestamp: Date) => {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-interface">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-title">
          <h2>TourCraft AI Assistant</h2>
          <div className={`connection-status ${state.isConnected ? 'connected' : 'disconnected'}`}>
            <div className="status-dot"></div>
            <span>
              {state.isConnecting ? 'Connecting...' : 
               state.isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
        <div className="chat-controls">
          <button 
            onClick={clearMessages}
            className="clear-btn"
            disabled={state.messages.length === 0}
          >
            Clear
          </button>
          <button 
            onClick={state.isConnected ? disconnect : connect}
            className={`connect-btn ${state.isConnected ? 'disconnect' : 'connect'}`}
          >
            {state.isConnected ? 'Disconnect' : 'Connect'}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {(state.error || error) && (
        <div className="error-message">
          <span>⚠️ {state.error || error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Messages */}
      <div className="messages-container">
        {state.messages.length === 0 ? (
          <div className="welcome-message">
            <h3>Welcome to TourCraft!</h3>
            <p>Your AI assistant for tour planning and management.</p>
            <p>Ask me about:</p>
            <ul>
              <li>Tour planning strategies</li>
              <li>Location recommendations</li>
              <li>Music trend analysis</li>
              <li>Band coordination</li>
            </ul>
          </div>
        ) : (
          state.messages.map((message) => (
            <div key={message.id} className={`message ${message.type}`}>
              <div className="message-content">
                {message.toolEvent ? (
                  <div className="message-text">
                    <div className="tool-inline">
                      <span className="tool-inline-icon">{
                        (() => {
                          const n = (message.toolEvent?.name || '').toLowerCase();
                          if (n.includes('analyze_music_trends')) return '🎵';
                          if (n.includes('get_server_status')) return '🩺';
                          return '🔧';
                        })()
                      }</span>
                      <span className="tool-inline-name">{message.toolEvent.name}</span>
                      <span className="tool-inline-sub">from MCP</span>
                    </div>
                    <div className="message-markdown" dangerouslySetInnerHTML={renderMarkdown(message.content)} />
                  </div>
                ) : (
                  <div className="message-text message-markdown" dangerouslySetInnerHTML={renderMarkdown(message.content)} />
                )}
                <div className="message-time">{formatTime(message.timestamp)}</div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="message-input-form">
        <div className="input-container">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={state.isConnected ? "Ask me about tour planning..." : "Connect to start chatting..."}
            disabled={!state.isConnected}
            className="message-input"
            rows={1}
          />
          <button 
            type="submit" 
            disabled={!inputValue.trim() || !state.isConnected}
            className="send-button"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatInterface;
