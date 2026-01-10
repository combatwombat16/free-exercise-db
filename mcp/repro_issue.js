import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function run() {
    // Start the server
    console.log('Starting server...');
    const serverProcess = spawn('node', ['build/index.js', '--http', '--port=3001'], {
        cwd: __dirname,
        stdio: 'inherit'
    });

    // serverProcess.stdout.on('data', data => console.log(`[Server Out] ${data}`));
    // serverProcess.stderr.on('data', data => console.log(`[Server Err] ${data}`));

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log("Sending POST initialization request...");

    const initMessage = {
        jsonrpc: "2.0",
        method: "initialize",
        params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0" }
        },
        id: 1
    };

    try {
        const res = await fetch("http://localhost:3001/mcp", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream"
            },
            body: JSON.stringify(initMessage)
        });

        console.log(`POST Status: ${res.status}`);
        const text = await res.text();
        console.log(`POST Body: ${text}`);

        const sessionId = res.headers.get('mcp-session-id');
        console.log(`Session ID from Header: ${sessionId}`);

        if (res.status === 200 && sessionId) {
            console.log("Initialization successful. Attempting GET...");
            // Now GET
            const resGet = await fetch(`http://localhost:3001/mcp?sessionId=${sessionId}`, {
                headers: {
                    "Accept": "text/event-stream",
                    "Mcp-Session-Id": sessionId
                }
            });
            console.log(`GET Status: ${resGet.status}`);
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

run();
