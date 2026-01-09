#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import {
    CallToolRequestSchema,
    ListResourcesRequestSchema,
    ListToolsRequestSchema,
    ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXERCISES_DATA_PATH = path.join(__dirname, "../../dist/exercises.json");

interface Exercise {
    id: string;
    name: string;
    force: string | null;
    level: string;
    mechanic: string | null;
    equipment: string | null;
    primaryMuscles: string[];
    secondaryMuscles: string[];
    instructions: string[];
    category: string;
    images: string[];
}

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

const server = new Server(
    {
        name: "free-exercise-db-mcp",
        version: "1.0.0",
    },
    {
        capabilities: {
            resources: {},
            tools: {},
        },
    }
);

/**
 * Resources
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
        resources: [
            {
                uri: "exercises://list",
                name: "List of all exercises",
                mimeType: "application/json",
                description: "A complete list of exercise IDs and names",
            },
        ],
    };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    if (request.params.uri === "exercises://list") {
        return {
            contents: [
                {
                    uri: request.params.uri,
                    mimeType: "application/json",
                    text: JSON.stringify(
                        exercises.map((e) => ({ id: e.id, name: e.name })),
                        null,
                        2
                    ),
                },
            ],
        };
    }

    const exerciseMatch = request.params.uri.match(/^exercise:\/\/([^/]+)$/);
    if (exerciseMatch) {
        const id = exerciseMatch[1];
        const exercise = exercises.find((e) => e.id === id);
        if (exercise) {
            return {
                contents: [
                    {
                        uri: request.params.uri,
                        mimeType: "application/json",
                        text: JSON.stringify(exercise, null, 2),
                    },
                ],
            };
        }
    }

    throw new Error("Resource not found");
});

/**
 * Tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "list_exercises",
                description: "List exercises with optional filters",
                inputSchema: {
                    type: "object",
                    properties: {
                        category: { type: "string" },
                        equipment: { type: "string" },
                        level: { type: "string", enum: ["beginner", "intermediate", "expert"] },
                        force: { type: "string", enum: ["pull", "push", "static"] },
                        mechanic: { type: "string", enum: ["isolation", "compound"] },
                    },
                },
            },
            {
                name: "get_exercise",
                description: "Get full details for a specific exercise by ID",
                inputSchema: {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                    },
                    required: ["id"],
                },
            },
            {
                name: "search_exercises",
                description: "Search for exercises by name or instructions",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: { type: "string" },
                    },
                    required: ["query"],
                },
            },
            {
                name: "search_by_muscles",
                description: "Search for exercises by targeted muscles",
                inputSchema: {
                    type: "object",
                    properties: {
                        primaryMuscles: { type: "array", items: { type: "string" } },
                        secondaryMuscles: { type: "array", items: { type: "string" } },
                    },
                },
            },
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
        case "list_exercises": {
            const filters = args as any;
            let filtered = exercises;

            if (filters.category) {
                filtered = filtered.filter((e) => e.category === filters.category);
            }
            if (filters.equipment) {
                filtered = filtered.filter((e) => e.equipment === filters.equipment);
            }
            if (filters.level) {
                filtered = filtered.filter((e) => e.level === filters.level);
            }
            if (filters.force) {
                filtered = filtered.filter((e) => e.force === filters.force);
            }
            if (filters.mechanic) {
                filtered = filtered.filter((e) => e.mechanic === filters.mechanic);
            }

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            filtered.map((e) => ({ id: e.id, name: e.name })),
                            null,
                            2
                        ),
                    },
                ],
            };
        }

        case "get_exercise": {
            const { id } = z.object({ id: z.string() }).parse(args);
            const exercise = exercises.find((e) => e.id === id);

            if (!exercise) {
                return {
                    content: [{ type: "text", text: `Exercise with ID ${id} not found.` }],
                    isError: true,
                };
            }

            return {
                content: [{ type: "text", text: JSON.stringify(exercise, null, 2) }],
            };
        }

        case "search_exercises": {
            const { query } = z.object({ query: z.string() }).parse(args);
            const lowerQuery = query.toLowerCase();

            const results = exercises.filter(
                (e) =>
                    e.name.toLowerCase().includes(lowerQuery) ||
                    e.instructions.some((inst) => inst.toLowerCase().includes(lowerQuery))
            );

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            results.map((e) => ({ id: e.id, name: e.name })),
                            null,
                            2
                        ),
                    },
                ],
            };
        }

        case "search_by_muscles": {
            const { primaryMuscles, secondaryMuscles } = z
                .object({
                    primaryMuscles: z.array(z.string()).optional(),
                    secondaryMuscles: z.array(z.string()).optional(),
                })
                .parse(args);

            const results = exercises.filter((e) => {
                const matchesPrimary = primaryMuscles
                    ? primaryMuscles.every((m) => e.primaryMuscles.includes(m))
                    : true;
                const matchesSecondary = secondaryMuscles
                    ? secondaryMuscles.every((m) => e.secondaryMuscles.includes(m))
                    : true;
                return matchesPrimary && matchesSecondary;
            });

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(
                            results.map((e) => ({ id: e.id, name: e.name })),
                            null,
                            2
                        ),
                    },
                ],
            };
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
});

async function main() {
    await loadData();

    const isHttp = process.argv.includes("--http");
    const transportType = isHttp ? "http" : "stdio";

    if (transportType === "http") {
        const portArg = process.argv.find(arg => arg.startsWith("--port="));
        const hostArg = process.argv.find(arg => arg.startsWith("--host="));

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
