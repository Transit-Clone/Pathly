import { app } from "./app.js";

const rawPort = process.env.PORT ?? "3000";
const host = process.env.HOST ?? "0.0.0.0";

if (!/^\d+$/.test(rawPort)) {
  throw new Error("PORT must be an integer between 0 and 65535");
}

const port = Number(rawPort);

if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new Error("PORT must be an integer between 0 and 65535");
}

const server = app.listen(port, host, () => {
  const address = server.address();
  const boundPort = typeof address === "object" && address ? address.port : port;

  console.log(`Pathly API listening on http://${host}:${boundPort}`);
});
