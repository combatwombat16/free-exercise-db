#!/usr/bin/env node

import { startServer } from "./server.js";
import { logger } from "./transport/transports.js";

const args = process.argv.slice(2);
const options: Record<string, string | boolean> = {};

for (const arg of args) {
    if (arg.startsWith("--")) {
        const [key, value] = arg.substring(2).split("=");
        options[key] = value === undefined ? true : value;
    }
}

if (options.transport) {
    process.env.TRANSPORT = String(options.transport);
}

if (options.port) {
    process.env.PORT = String(options.port);
}

if (options.host) {
    process.env.HOST = String(options.host);
}

logger.info("Starting Free Exercise DB MCP server...");
if (options.transport) {
    logger.info(`Transport mode: ${options.transport}`);
}

logger.info("Enabled capabilities:");
logger.info("- Resources: Exercise data access");
logger.info("- Tools: Exercise search and filtering");

startServer().catch((error: Error) => {
    logger.error("Failed to start MCP server:", error);
    process.exit(1);
});
