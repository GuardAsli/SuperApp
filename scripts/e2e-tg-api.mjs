// Ephemeral fake Telegram Bot API for local end-to-end bot verification.
// Records every request body to /tmp/ga-e2e-tg.jsonl (one JSON per line).
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";

const port = Number(process.env.TG_PORT ?? 8899);
createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    appendFileSync("/tmp/ga-e2e-tg.jsonl", JSON.stringify({ path: req.url, body }) + "\n");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, result: { message_id: 1 } }));
  });
}).listen(port, "127.0.0.1", () => console.log(`fake telegram api on 127.0.0.1:${port}`));
