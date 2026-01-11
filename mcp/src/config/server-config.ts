import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
export const HOST = process.env.HOST || "0.0.0.0";

export const EXERCISES_DATA_PATH = path.join(__dirname, "../../../dist/exercises.json");

export const serverConfig = {
    name: "free-exercise-db-mcp",
    version: "1.0.0",
    description: "MCP server for Free Exercise Database"
};
