# TourCraft - AI Tour Management System

## Project Overview
TourCraft is an AI-powered assistant system designed to help managers of singers and pop stars plan tours based on music trends across locations. The system will analyze trends, suggest locations, coordinate with band members, and manage tour logistics.

## Current Phase: MVP Chat System
Building a basic conversational AI chat system as the foundation for the larger tour management platform.

## Architecture

### Frontend (React + Cloudflare Pages)
- **Hosting**: Cloudflare Pages (separate deployment)
- **Framework**: React
- **Features**: 
  - Real-time chat interface
  - WebSocket connection to backend
  - No authentication (for MVP)
- **Benefits**:
  - Fast deployments
  - Automatic HTTPS
  - Global CDN
  - Cost-effective

### Backend (Cloudflare Workers + Durable Objects)
- **Runtime**: Cloudflare Workers
- **AI Model**: gpt-4o-mini
- **Memory**: Durable Objects for conversation state
- **Communication**: WebSocket connections
- **Features**:
  - Real-time chat responses
  - Persistent conversation memory
  - No authentication (for MVP)
  - Text-only chat (no file uploads)

## Technical Stack

### Frontend
- React
- WebSocket client
- Cloudflare Pages hosting

### Backend
- Cloudflare Workers
- Durable Objects
- Cloudflare AI Models
- WebSocket server

### AI Integration
- Model: gpt-4o-mini
- Purpose: Conversational AI assistant
- Memory: Durable Object persistence

## Implementation Phases

### Phase 1: Basic React Frontend
- [ ] Set up React project
- [ ] Create basic chat UI
- [ ] Implement WebSocket client
- [ ] Deploy to Cloudflare Pages

### Phase 2: Cloudflare Worker Backend
- [ ] Create Worker with WebSocket support
- [ ] Implement Durable Object for chat state
- [ ] Basic message handling
- [ ] Deploy Worker

### Phase 3: AI Integration
- [ ] Integrate gpt-4o-mini
- [ ] Implement chat responses
- [ ] Test AI functionality

### Phase 4: Enhanced Features
- [ ] Conversation memory
- [ ] Error handling
- [ ] Connection management
- [ ] Performance optimization

### Phase 5: Tour Management Features (Future)
- [ ] Music trend analysis
- [ ] Location suggestions
- [ ] Band member coordination
- [ ] Tour planning automation

## Project Structure
```
TourCraft/
├── src/              # Cloudflare Worker backend
│   └── index.ts      # Main worker file
├── pages/            # React frontend (Cloudflare Pages)
│   ├── src/
│   ├── public/
│   └── package.json
├── wrangler.jsonc    # Worker configuration
├── package.json      # Worker dependencies
├── plan.md           # This file
└── README.md         # Project documentation
```

## Deployment Strategy
- **Frontend**: Cloudflare Pages deployment (from `pages/` directory)
- **Backend**: Cloudflare Worker deployment (from root directory)
- **Communication**: WebSocket connection between frontend and backend

## Key Requirements
- ✅ No authentication (MVP)
- ✅ Text-only chat
- ✅ Real-time WebSocket communication
- ✅ Persistent conversation memory
- ✅ Cloudflare AI model integration
- ✅ Separate frontend/backend deployments

## Next Steps
1. Set up React frontend project in `pages/` directory
2. Create basic chat interface
3. Implement WebSocket client
4. Deploy to Cloudflare Pages
5. Enhance existing Cloudflare Worker backend in `src/`
6. Implement Durable Object for memory
7. Integrate AI model
8. Test end-to-end functionality

## Notes
- This is the foundation for the larger TourCraft system
- Focus on building a solid chat system first
- Architecture is designed to scale for future tour management features
- All components use Cloudflare ecosystem for consistency and performance

## MCP Server Architecture (Phase 6+)

### Overview
TourCraft will evolve into a modular MCP (Model Context Protocol) server architecture where specialized MCP servers handle different aspects of tour management. The main ChatAgent acts as an MCP client that connects to multiple specialized servers.

### Proposed MCP Server Structure
```
TourCraft ChatAgent (MCP Client)
├── Music Trends MCP Server (Mock → Spotify/YouTube APIs)
├── Venue Research MCP Server (Mock → Booking APIs)
├── Budget Planning MCP Server (Mock → Financial APIs)
├── Band Coordination MCP Server (Mock → Communication APIs)
└── Tour Logistics MCP Server (Mock → Travel/Transport APIs)
```

### Phase 6: Music Trends MCP Server
- **Purpose**: Analyze music trends and location popularity
- **Tools**:
  - `analyze_music_trends` - Analyze current music trends by genre/location
  - `get_location_popularity` - Get popularity scores for specific locations
  - `suggest_tour_locations` - Suggest optimal tour locations based on trends
  - `get_genre_insights` - Get insights about specific music genres
- **Implementation**: Start with mock data, transition to Spotify/YouTube APIs
- **Deployment**: Separate Cloudflare Worker with MCP server capabilities

### Phase 7: Venue Research MCP Server
- **Purpose**: Research and analyze venues for tour locations
- **Tools**:
  - `search_venues` - Search venues by location and capacity
  - `get_venue_details` - Get detailed venue information
  - `check_availability` - Check venue availability for dates
  - `get_venue_pricing` - Get pricing information for venues
- **Implementation**: Mock venue data → Real venue booking APIs
- **Integration**: Connect with Music Trends server for location suggestions

### Phase 8: Budget Planning MCP Server
- **Purpose**: Handle tour budget calculations and financial planning
- **Tools**:
  - `calculate_tour_costs` - Calculate total tour costs
  - `estimate_revenue` - Estimate potential revenue from tour
  - `optimize_budget` - Suggest budget optimizations
  - `track_expenses` - Track and categorize tour expenses
- **Implementation**: Mock financial data → Real financial APIs
- **Features**: Cost breakdowns, revenue projections, budget alerts

### Phase 9: Band Coordination MCP Server
- **Purpose**: Manage band member schedules and communication
- **Tools**:
  - `get_member_availability` - Check band member availability
  - `schedule_rehearsals` - Schedule rehearsal sessions
  - `send_notifications` - Send notifications to band members
  - `coordinate_travel` - Coordinate travel arrangements
- **Implementation**: Mock member data → Real communication APIs
- **Features**: Calendar integration, notification system, travel coordination

### Phase 10: Tour Logistics MCP Server
- **Purpose**: Handle travel, accommodation, and logistics
- **Tools**:
  - `plan_travel_routes` - Plan optimal travel routes between venues
  - `book_accommodations` - Book hotels and accommodations
  - `coordinate_transport` - Coordinate transportation needs
  - `manage_equipment` - Track and manage equipment logistics
- **Implementation**: Mock logistics data → Real travel/booking APIs
- **Integration**: Connect with all other servers for comprehensive planning

### MCP Server Benefits
- **Modular Architecture**: Each server handles one domain
- **Independent Deployment**: Deploy and scale servers separately
- **Mock-to-Real Transition**: Start with mock data, transition to real APIs
- **Easy Testing**: Test logic without API dependencies
- **Scalability**: Add more servers as needed
- **Maintainability**: Isolated codebases for each domain

### Implementation Strategy
1. **Start with Music Trends MCP Server** (core functionality)
2. **Build mock data** for immediate testing and development
3. **Integrate with ChatAgent** as MCP client
4. **Test end-to-end functionality** with mock data
5. **Gradually replace mock data** with real APIs
6. **Add additional MCP servers** based on priority

### Technical Stack for MCP Servers
- **Runtime**: Cloudflare Workers
- **MCP Framework**: Cloudflare Agents MCP package
- **Storage**: Durable Objects for state management
- **Authentication**: OAuth 2.1 for API integrations
- **Transport**: SSE and Streamable HTTP endpoints
- **Deployment**: Separate Cloudflare Worker deployments
