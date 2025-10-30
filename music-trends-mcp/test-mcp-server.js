#!/usr/bin/env node

/**
 * Test script for Music Trends MCP Server
 * This script tests the MCP server endpoints and tool functionality
 */

const MCP_SERVER_URL = 'http://localhost:8787'; // Change to your deployed URL

async function testHealthEndpoint() {
  console.log('🔍 Testing health endpoint...');
  try {
    const response = await fetch(`${MCP_SERVER_URL}/health`);
    const data = await response.json();
    console.log('✅ Health check passed:', data);
    return true;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

async function testSSEEndpoint() {
  console.log('🔍 Testing SSE endpoint...');
  try {
    const response = await fetch(`${MCP_SERVER_URL}/sse`, {
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (response.ok) {
      console.log('✅ SSE endpoint accessible');
      return true;
    } else {
      console.error('❌ SSE endpoint failed:', response.status, response.statusText);
      return false;
    }
  } catch (error) {
    console.error('❌ SSE endpoint test failed:', error.message);
    return false;
  }
}

async function testMCPEndpoint() {
  console.log('🔍 Testing MCP endpoint...');
  try {
    const response = await fetch(`${MCP_SERVER_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list'
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ MCP endpoint accessible, tools:', data.result?.tools?.map(t => t.name));
      return true;
    } else {
      console.error('❌ MCP endpoint failed:', response.status, response.statusText);
      return false;
    }
  } catch (error) {
    console.error('❌ MCP endpoint test failed:', error.message);
    return false;
  }
}

async function testToolExecution() {
  console.log('🔍 Testing tool execution...');
  try {
    const response = await fetch(`${MCP_SERVER_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'analyze_music_trends',
          arguments: {
            genre: 'hip-hop',
            location: 'New York'
          }
        }
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Tool execution successful');
      console.log('📊 Result:', data.result?.content?.[0]?.text?.substring(0, 200) + '...');
      return true;
    } else {
      console.error('❌ Tool execution failed:', response.status, response.statusText);
      return false;
    }
  } catch (error) {
    console.error('❌ Tool execution test failed:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('🚀 Starting Music Trends MCP Server Tests\n');
  
  const tests = [
    testHealthEndpoint,
    testSSEEndpoint,
    testMCPEndpoint,
    testToolExecution
  ];
  
  let passed = 0;
  let total = tests.length;
  
  for (const test of tests) {
    const result = await test();
    if (result) passed++;
    console.log(''); // Add spacing between tests
  }
  
  console.log(`📊 Test Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All tests passed! Music Trends MCP Server is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Check the server configuration.');
  }
}

// Run tests
runAllTests().catch(console.error);
