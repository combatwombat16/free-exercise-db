import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import express from "express";
import fsPromises from "node:fs/promises";
import { Exercise } from "./types.js";
import { registerTools } from "./tools.js";
import { setupStdioTransport, setupHttpTransport, logger } from "./transport/transports.js";
import { serverConfig, EXERCISES_DATA_PATH } from "./config/server-config.js";

let exercises: Exercise[] = [];

async function loadData() {
    try {
        const data = await fsPromises.readFile(EXERCISES_DATA_PATH, "utf-8");
        exercises = JSON.parse(data);
        logger.info(`Loaded ${exercises.length} exercises.`);
    } catch (error) {
        logger.error("Error loading exercises data:", error);
        process.exit(1);
    }
}

function createServer() {
    const server = new McpServer(serverConfig, {
        capabilities: {
            resources: {},
            tools: {},
        }
    });

    // Register Resources
    server.registerResource(
        "list-exercises",
        "exercises://list",
        {},
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
        {},
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

    return server;
}

/**
 * Start the MCP server with configured transports
 * Uses either stdio (for VS Code extension) or HTTP (for browser/API clients)
 */
export async function startServer() {
    await loadData();

    const server = createServer();

    if (process.env.TRANSPORT === "stdio") {
        await setupStdioTransport(server);
    } else {
        const app = express();
        await setupHttpTransport(server, app);
    }

    return server;
}
