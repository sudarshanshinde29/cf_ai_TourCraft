import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ExecutionContext, ExportedHandler, Request, DurableObjectNamespace } from "@cloudflare/workers-types";

interface Env {
  MCP_OBJECT: DurableObjectNamespace;
}

// Mock music trend data
const MOCK_MUSIC_TRENDS = {
  genres: {
    pop: {
      popularity: 85,
      trend: "rising",
      locations: {
        "New York": 92,
        "Los Angeles": 88,
        "London": 85,
        "Tokyo": 78,
        "Berlin": 82,
        "Sydney": 80,
        "Toronto": 87,
        "Paris": 83
      }
    },
    rock: {
      popularity: 72,
      trend: "stable",
      locations: {
        "New York": 78,
        "Los Angeles": 85,
        "London": 88,
        "Tokyo": 65,
        "Berlin": 82,
        "Sydney": 75,
        "Toronto": 80,
        "Paris": 77
      }
    },
    "hip-hop": {
      popularity: 90,
      trend: "rising",
      locations: {
        "New York": 95,
        "Los Angeles": 92,
        "London": 78,
        "Tokyo": 68,
        "Berlin": 72,
        "Sydney": 75,
        "Toronto": 88,
        "Paris": 70
      }
    },
    electronic: {
      popularity: 68,
      trend: "stable",
      locations: {
        "New York": 75,
        "Los Angeles": 72,
        "London": 85,
        "Tokyo": 88,
        "Berlin": 92,
        "Sydney": 78,
        "Toronto": 70,
        "Paris": 82
      }
    },
    country: {
      popularity: 58,
      trend: "declining",
      locations: {
        "New York": 45,
        "Los Angeles": 52,
        "London": 35,
        "Tokyo": 25,
        "Berlin": 30,
        "Sydney": 48,
        "Toronto": 55,
        "Paris": 28
      }
    },
    jazz: {
      popularity: 42,
      trend: "stable",
      locations: {
        "New York": 65,
        "Los Angeles": 58,
        "London": 72,
        "Tokyo": 45,
        "Berlin": 68,
        "Sydney": 52,
        "Toronto": 48,
        "Paris": 75
      }
    }
  },
  locations: {
    "New York": {
      overall_popularity: 88,
      top_genres: ["hip-hop", "pop", "rock"],
      venue_capacity: "high",
      avg_ticket_price: 85
    },
    "Los Angeles": {
      overall_popularity: 85,
      top_genres: ["hip-hop", "rock", "pop"],
      venue_capacity: "high",
      avg_ticket_price: 90
    },
    "London": {
      overall_popularity: 82,
      top_genres: ["rock", "electronic", "pop"],
      venue_capacity: "high",
      avg_ticket_price: 75
    },
    "Tokyo": {
      overall_popularity: 78,
      top_genres: ["electronic", "pop", "rock"],
      venue_capacity: "medium",
      avg_ticket_price: 95
    },
    "Berlin": {
      overall_popularity: 80,
      top_genres: ["electronic", "rock", "pop"],
      venue_capacity: "medium",
      avg_ticket_price: 65
    },
    "Sydney": {
      overall_popularity: 75,
      top_genres: ["pop", "rock", "hip-hop"],
      venue_capacity: "medium",
      avg_ticket_price: 80
    },
    "Toronto": {
      overall_popularity: 83,
      top_genres: ["hip-hop", "pop", "rock"],
      venue_capacity: "high",
      avg_ticket_price: 70
    },
    "Paris": {
      overall_popularity: 79,
      top_genres: ["electronic", "jazz", "pop"],
      venue_capacity: "medium",
      avg_ticket_price: 85
    }
  }
};

export class MusicTrendsMCP extends McpAgent<Env> {
  server = new McpServer({
    name: "Music Trends Server",
    version: "1.0.0",
  });

  async init() {
    console.log("🎵 Initializing Music Trends MCP Server...");
    
    // Main tool: Analyze music trends
    this.server.tool(
      "analyze_music_trends",
      "Analyze current music trends by genre and location",
      {
        genre: z.string().optional(),
        location: z.string().optional(),
        timePeriod: z.enum(["week", "month", "year"]).optional().default("month")
      },
      async ({ genre, location, timePeriod }) => {
        console.log(`🎵 MCP TOOL CALLED: analyze_music_trends`);
        console.log(`📊 Parameters: genre=${genre}, location=${location}, timePeriod=${timePeriod}`);
        try {
          let analysis = "";

          if (genre && location) {
            // Analyze specific genre in specific location
            const genreData = MOCK_MUSIC_TRENDS.genres[genre as keyof typeof MOCK_MUSIC_TRENDS.genres];
            const locationData = MOCK_MUSIC_TRENDS.locations[location as keyof typeof MOCK_MUSIC_TRENDS.locations];
            
            if (!genreData || !locationData) {
              return {
                content: [{
                  type: "text",
                  text: `Sorry, I don't have data for ${genre} in ${location}. Available genres: ${Object.keys(MOCK_MUSIC_TRENDS.genres).join(", ")}. Available locations: ${Object.keys(MOCK_MUSIC_TRENDS.locations).join(", ")}`
                }]
              };
            }

            const popularity = genreData.locations[location as keyof typeof genreData.locations];
            const trend = genreData.trend;
            const overallGenrePopularity = genreData.popularity;

            analysis = `🎵 **${genre.toUpperCase()} Trends in ${location}**\n\n` +
              `📊 **Current Popularity**: ${popularity}/100\n` +
              `📈 **Trend Direction**: ${trend}\n` +
              `🌍 **Global Genre Popularity**: ${overallGenrePopularity}/100\n` +
              `🎫 **Average Ticket Price**: $${locationData.avg_ticket_price}\n` +
              `🏟️ **Venue Capacity**: ${locationData.venue_capacity}\n\n` +
              `**Analysis**: ${genre} is performing ${popularity > 80 ? 'very well' : popularity > 60 ? 'moderately' : 'below average'} in ${location}. ` +
              `The trend is ${trend}, suggesting ${trend === 'rising' ? 'increasing demand' : trend === 'stable' ? 'consistent demand' : 'decreasing demand'} for ${genre} music in this market.`;

          } else if (genre) {
            // Analyze specific genre across all locations
            const genreData = MOCK_MUSIC_TRENDS.genres[genre as keyof typeof MOCK_MUSIC_TRENDS.genres];
            
            if (!genreData) {
              return {
                content: [{
                  type: "text",
                  text: `Sorry, I don't have data for ${genre}. Available genres: ${Object.keys(MOCK_MUSIC_TRENDS.genres).join(", ")}`
                }]
              };
            }

            const topLocations = Object.entries(genreData.locations)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 5);

            analysis = `🎵 **${genre.toUpperCase()} Global Trends**\n\n` +
              `📊 **Global Popularity**: ${genreData.popularity}/100\n` +
              `📈 **Trend Direction**: ${genreData.trend}\n\n` +
              `🏆 **Top Performing Locations**:\n` +
              topLocations.map(([loc, score], index) => 
                `${index + 1}. ${loc}: ${score}/100`
              ).join('\n') + '\n\n' +
              `**Analysis**: ${genre} has a global popularity of ${genreData.popularity}/100 and is currently ${genreData.trend}. ` +
              `The top markets for ${genre} are ${topLocations.slice(0, 3).map(([loc]) => loc).join(', ')}.`;

          } else if (location) {
            // Analyze specific location across all genres
            const locationData = MOCK_MUSIC_TRENDS.locations[location as keyof typeof MOCK_MUSIC_TRENDS.locations];
            
            if (!locationData) {
              return {
                content: [{
                  type: "text",
                  text: `Sorry, I don't have data for ${location}. Available locations: ${Object.keys(MOCK_MUSIC_TRENDS.locations).join(", ")}`
                }]
              };
            }

            const genreScores = Object.entries(MOCK_MUSIC_TRENDS.genres)
              .map(([genre, data]) => ({
                genre,
                score: data.locations[location as keyof typeof data.locations],
                trend: data.trend
              }))
              .sort((a, b) => b.score - a.score);

            analysis = `🌍 **${location} Music Market Analysis**\n\n` +
              `📊 **Overall Market Popularity**: ${locationData.overall_popularity}/100\n` +
              `🎫 **Average Ticket Price**: $${locationData.avg_ticket_price}\n` +
              `🏟️ **Venue Capacity**: ${locationData.venue_capacity}\n\n` +
              `🎵 **Top Genres in ${location}**:\n` +
              genreScores.slice(0, 5).map(({ genre, score, trend }, index) => 
                `${index + 1}. ${genre}: ${score}/100 (${trend})`
              ).join('\n') + '\n\n' +
              `**Analysis**: ${location} is a ${locationData.overall_popularity > 80 ? 'high-demand' : locationData.overall_popularity > 60 ? 'moderate-demand' : 'developing'} music market ` +
              `with strong performance in ${locationData.top_genres.join(', ')}. The market shows ${locationData.venue_capacity} venue capacity and ` +
              `average ticket prices of $${locationData.avg_ticket_price}.`;

          } else {
            // General trend analysis
            const trendingGenres = Object.entries(MOCK_MUSIC_TRENDS.genres)
              .filter(([, data]) => data.trend === 'rising')
              .sort(([,a], [,b]) => b.popularity - a.popularity);

            const topMarkets = Object.entries(MOCK_MUSIC_TRENDS.locations)
              .sort(([,a], [,b]) => b.overall_popularity - a.overall_popularity)
              .slice(0, 5);

            analysis = `🎵 **Global Music Trends Analysis**\n\n` +
              `📈 **Currently Trending Genres**:\n` +
              trendingGenres.map(([genre, data], index) => 
                `${index + 1}. ${genre}: ${data.popularity}/100 (rising)`
              ).join('\n') + '\n\n' +
              `🌍 **Top Music Markets**:\n` +
              topMarkets.map(([location, data], index) => 
                `${index + 1}. ${location}: ${data.overall_popularity}/100`
              ).join('\n') + '\n\n' +
              `**Analysis**: The music industry is currently seeing strong growth in ${trendingGenres.slice(0, 3).map(([genre]) => genre).join(', ')}. ` +
              `The top performing markets are ${topMarkets.slice(0, 3).map(([loc]) => loc).join(', ')}, which offer excellent opportunities for tour planning.`;

          }

          return {
            content: [{
              type: "text",
              text: analysis
            }]
          };

        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error analyzing music trends: ${error.message}`
            }]
          };
        }
      }
    );

    // Health check tool
    this.server.tool(
      "get_server_status",
      "Get the status of the Music Trends MCP server",
      {},
      async () => {
        return {
          content: [{
            type: "text",
            text: `🎵 Music Trends MCP Server Status: ✅ Healthy\n\n` +
              `📊 Available Data:\n` +
              `- Genres: ${Object.keys(MOCK_MUSIC_TRENDS.genres).length}\n` +
              `- Locations: ${Object.keys(MOCK_MUSIC_TRENDS.locations).length}\n` +
              `- Tools: analyze_music_trends, get_server_status\n\n` +
              `🔄 Last Updated: ${new Date().toISOString()}`
          }]
        };
      }
    );
  }
}

// Support both SSE and Streamable HTTP transport methods
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // SSE transport endpoint (for existing MCP clients)
    if (url.pathname === "/sse" || url.pathname === "/sse/message") {
      return MusicTrendsMCP.serveSSE("/sse").fetch(request as any, env, ctx);
    }

    // Streamable HTTP transport endpoint (for new MCP clients)
    if (url.pathname === "/mcp") {
      try {
        return MusicTrendsMCP.serve("/mcp").fetch(request as any, env, ctx);
      } catch (error) {
        console.error("MCP serve error:", error);
        return Response.json({ 
          error: "MCP server error", 
          details: error.message 
        }, { status: 500 });
      }
    }

    // Health check endpoint
    if (url.pathname === "/health") {
      return Response.json({ 
        status: "healthy", 
        server: "Music Trends MCP Server",
        version: "1.0.0",
        tools: ["analyze_music_trends", "get_server_status"],
        available_genres: Object.keys(MOCK_MUSIC_TRENDS.genres),
        available_locations: Object.keys(MOCK_MUSIC_TRENDS.locations)
      });
    }

    return new Response("Not found", { status: 404 });
  },
} as any;
