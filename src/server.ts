import "dotenv/config";
import { randomBytes } from "node:crypto";
import { createApp } from "./app.js";
import { connectDatabase } from "./database.js";
import { seedDemo } from "./seed.js";

const production = process.env.NODE_ENV === "production";
let secret = process.env.JWT_SECRET;
if (!secret && !production) {
  secret = randomBytes(48).toString("hex");
  console.log(
    "Using a temporary development session secret. Set JWT_SECRET to preserve sessions across restarts.",
  );
}
const app = createApp({
  secret,
  origin: process.env.CLIENT_ORIGIN,
  production,
});
try {
  const disconnect = await connectDatabase();
  if (
    process.env.SEED_DEMO === "true" ||
    (process.env.MONGODB_LOCAL === "1" && process.env.SEED_DEMO !== "false")
  )
    await seedDemo();
  const server = app.listen(process.env.PORT || 4000, () =>
    console.log(
      `SkillBridge API: http://localhost:${process.env.PORT || 4000}`,
    ),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () =>
      server.close(async () => {
        await disconnect();
        process.exit(0);
      }),
    );
} catch (error) {
  console.error(
    "Unable to start SkillBridge:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
