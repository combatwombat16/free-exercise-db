#!/usr/bin/env node
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
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

// Create an MCP server instance using the high-level API
const server = new McpServer({
    name: "free-exercise-db-mcp",
    version: "1.0.0",
});

async function main() {
    await loadData();

    // Register Resources
    server.resource(
        "list-exercises",
        "exercises://list",
        async (uri) => ({
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

    server.resource(
        "get-exercise",
        new ResourceTemplate("exercise://{id}", { list: undefined }),
        async (uri, { id }) => {
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
    server.tool(
        "list_exercises",
        {
            category: z.string().optional(),
            equipment: z.string().optional(),
            level: z.enum(["beginner", "intermediate", "expert"]).optional(),
            force: z.enum(["pull", "push", "static"]).optional(),
            mechanic: z.enum(["isolation", "compound"]).optional(),
        },
        async (args) => {
            let filtered = exercises;
            if (args.category) filtered = filtered.filter((e) => e.category === args.category);
            if (args.equipment) filtered = filtered.filter((e) => e.equipment === args.equipment);
            if (args.level) filtered = filtered.filter((e) => e.level === args.level);
            if (args.force) filtered = filtered.filter((e) => e.force === args.force);
            if (args.mechanic) filtered = filtered.filter((e) => e.mechanic === args.mechanic);

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
    );

    server.tool(
        "get_exercise",
        {
            id: z.string(),
        },
        async ({ id }) => {
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
    );

    server.tool(
        "search_exercises",
        {
            query: z.string(),
        },
        async ({ query }) => {
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
    );

    server.tool(
        "search_by_muscles",
        {
            primaryMuscles: z.array(z.string()).optional(),
            secondaryMuscles: z.array(z.string()).optional(),
        },
        async ({ primaryMuscles, secondaryMuscles }) => {
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
    );

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
