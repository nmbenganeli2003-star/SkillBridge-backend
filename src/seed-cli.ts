import "dotenv/config";
import { connectDatabase } from "./database.js";
import { seedDemo } from "./seed.js";
const disconnect = await connectDatabase();
try {
  await seedDemo();
} finally {
  await disconnect();
}
