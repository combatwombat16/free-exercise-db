#!/usr/bin/env node
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Exercise } from "./types.js";
import { registerTools } from "./tools.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXERCISES_DATA_PATH = path.join(__dirname, "../../dist/exercises.json");

let exercises: Exercise[] = [];

async function loadData() {
    try {
        const data = await fs.readFile(EXERCISES_DATA_PATH, "utf-8");
        exercises = JSON.parse(data);
        console.error(`Loaded ${exercises.length} exercises.`);
    } catch (error) {
        console.error("Error loading exercises data:", error);
        process.exit(1);
    }
}

// Create an MCP server instance using the high-level API
const server = new McpServer({
    name: "free-exercise-db-mcp",
    version: "1.0.0",
});

async function main() {
    await loadData();

    // Register Resources
    server.registerResource(
        "list-exercises",
        "exercises://list",
        {}, // No metadata
        async (uri: URL) => ({
            contents: [
                {
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify(
                        exercises.map((e) => ({ id: e.id, name: e.name })),
                        null,
                        2
                    ),
                },
            ],
        })
    );

    server.registerResource(
        "get-exercise",
        new ResourceTemplate("exercise://{id}", { list: undefined }),
        {}, // No metadata
        async (uri: URL, vars: unknown) => {
            const { id } = vars as { id: string };
            const exercise = exercises.find((e) => e.id === id);
            if (!exercise) {
                throw new Error(`Exercise with ID ${id} not found`);
            }
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: "application/json",
                        text: JSON.stringify(exercise, null, 2),
                    },
                ],
            };
        }
    );

    // Register Tools
    registerTools(server, exercises);

    // Transport Setup
    const isHttp = process.argv.includes("--http");
    const transportType = isHttp ? "http" : "stdio";

    if (transportType === "http") {
        const portArg = process.argv.find((arg) => arg.startsWith("--port="));
        const hostArg = process.argv.find((arg) => arg.startsWith("--host="));

        const port = portArg ? parseInt(portArg.split("=")[1], 10) : parseInt(process.env.PORT || "3000", 10);
        const host = hostArg ? hostArg.split("=")[1] : "localhost";

        const app = express();
        app.use(express.json());

        const transports: Record<string, StreamableHTTPServerTransport> = {};

        const mcpHandler = async (req: express.Request, res: express.Response) => {
            const sessionId = req.headers["mcp-session-id"] as string;

            try {
                let transport: StreamableHTTPServerTransport;

                if (sessionId && transports[sessionId]) {
                    transport = transports[sessionId];
                } else if (!sessionId && req.method === "POST" && req.body?.method === "initialize") {
                    console.error("New Streamable HTTP connection");
                    transport = new StreamableHTTPServerTransport({
                        sessionIdGenerator: () => randomUUID(),
                        onsessioninitialized: (sid) => {
                            console.error(`Session initialized: ${sid}`);
                            transports[sid] = transport;
                        },
                    });

                    transport.onclose = () => {
                        const sid = transport.sessionId;
                        if (sid && transports[sid]) {
                            console.error(`Session closed: ${sid}`);
                            delete transports[sid];
                        }
                    };

                    await server.connect(transport);
                    await transport.handleRequest(req, res, req.body);
                    return;
                } else {
                    res.status(400).json({
                        jsonrpc: "2.0",
                        error: { code: -32000, message: "Invalid session or missing initialization" },
                        id: null,
                    });
                    return;
                }

                await transport.handleRequest(req, res, req.body);
            } catch (error) {
                console.error("MCP error:", error);
                if (!res.headersSent) {
                    res.status(500).send("Internal error");
                }
            }
        };

        app.get("/health", (req, res) => {
            res.status(200).send("OK");
        });

        app.post("/mcp", mcpHandler);
        app.get("/mcp", mcpHandler);
        app.delete("/mcp", mcpHandler);

        app.listen(port, host, () => {
            console.error(`Free Exercise DB MCP server running on Streamable HTTP at http://${host}:${port}/mcp`);
        });
    } else {
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("Free Exercise DB MCP server running on stdio");
    }
}

main().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
});
