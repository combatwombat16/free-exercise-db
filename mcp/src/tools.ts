import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Exercise } from "./types.js";

export function registerTools(server: McpServer, exercises: Exercise[]) {
    server.registerTool(
        "list_exercises",
        {
            description: "List exercises with optional filters",
            inputSchema: z.object({
                category: z.string().optional(),
                equipment: z.string().optional(),
                level: z.enum(["beginner", "intermediate", "expert"]).optional(),
                force: z.enum(["pull", "push", "static"]).optional(),
                mechanic: z.enum(["isolation", "compound"]).optional(),
            }),
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

    server.registerTool(
        "get_exercise",
        {
            description: "Get full details for a specific exercise by ID",
            inputSchema: z.object({
                id: z.string(),
            }),
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

    server.registerTool(
        "search_exercises",
        {
            description: "Search for exercises by name or instructions",
            inputSchema: z.object({
                query: z.string(),
            }),
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

    server.registerTool(
        "search_by_muscles",
        {
            description: "Search for exercises by targeted muscles",
            inputSchema: z.object({
                primaryMuscles: z.array(z.string()).optional(),
                secondaryMuscles: z.array(z.string()).optional(),
            }),
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
}
