# Music Trends MCP Server

A Model Context Protocol (MCP) server that provides music trend analysis tools for TourCraft's tour planning system.

## Features

- **analyze_music_trends**: Analyze current music trends by genre and location
- **get_server_status**: Get server health and available data

## Available Data

### Genres
- Pop, Rock, Hip-Hop, Electronic, Country, Jazz

### Locations
- New York, Los Angeles, London, Tokyo, Berlin, Sydney, Toronto, Paris

## Usage Examples

### Analyze specific genre in location
```
analyze_music_trends(genre="hip-hop", location="New York")
```

### Analyze genre globally
```
analyze_music_trends(genre="pop")
```

### Analyze location market
```
analyze_music_trends(location="London")
```

### General trend analysis
```
analyze_music_trends()
```

## Endpoints

- **SSE**: `/sse` - For existing MCP clients
- **HTTP**: `/mcp` - For new MCP clients
- **Health**: `/health` - Server status

## Deployment

```bash
npm install
npm run deploy
```

## Development

```bash
npm install
npm run dev
```

## Integration with TourCraft

This MCP server is designed to be consumed by TourCraft's ChatAgent, which acts as an MCP client to provide music trend analysis capabilities for tour planning.
