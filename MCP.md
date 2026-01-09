# Free Exercise DB MCP Server

Expose the [Free Exercise Database](https://github.com/yuhonas/free-exercise-db) to agentic frameworks as a tool using the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/).

## Features

### Tools

- `list_exercises`: List exercises with optional filters (`category`, `equipment`, `level`, `force`, `mechanic`).
- `get_exercise`: Get full details (instructions, muscles, etc.) for a specific exercise ID.
- `search_exercises`: Keyword-based search across names and instructions.
- `search_by_muscles`: Find exercises targeting specific primary or secondary muscles.

### Resources

- `exercises://list`: JSON list of all available exercise IDs and names.
- `exercise://{id}`: Detailed JSON for a specific exercise.

### Endpoints

- `/health`: Simple GET endpoint returning 200 OK (HTTP transport only).

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [npm](https://www.npmjs.com/)

### Setup

1. From the project root, install all dependencies:

   ```bash
   npm install
   cd mcp && npm install
   ```

2. Build the project:

   ```bash
   npm run mcp:build
   ```

## Running the Server

### Stdio Transport (Default)

Best for local use with clients like `mcp-inspector` or desktop IDEs.

```bash
npm start
```

### HTTP (Streamable HTTP) Transport

Exposes the server over HTTP.
Default: `localhost` on port `3000`.

Configuration via arguments:

```bash
# Custom host and port
npm run mcp:http -- --host=0.0.0.0 --port=8080
```

Configuration via environment variables:

```bash
HOST=0.0.0.0 PORT=8080 npm run mcp:http
```

## Integration Example

### MCP Inspector

```bash
npx @modelcontextprotocol/inspector node mcp/build/index.js
```

### Stdio Client Configuration

```json
{
  "mcpServers": {
    "free-exercise-db": {
      "command": "node",
      "args": ["/absolute/path/to/free-exercise-db/mcp/build/index.js"]
    }
  }
}
```
