import mongoose from "mongoose";
import type { MongoMemoryServer as LocalMongoServer } from "mongodb-memory-server";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export async function connectDatabase() {
  let local: LocalMongoServer | undefined;
  let uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/skillbridge";
  if (process.env.MONGODB_LOCAL === "1") {
    if (process.env.NODE_ENV === "production")
      throw new Error("Use a managed MongoDB connection in production.");
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const dbPath = resolve(".data/mongodb");
    await mkdir(dbPath, { recursive: true });
    local = await MongoMemoryServer.create({
      instance: { dbPath, storageEngine: "wiredTiger" },
    });
    uri = local.getUri("skillbridge");
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log("Connected to MongoDB.");
  return async () => {
    await mongoose.disconnect();
    if (local) await local.stop({ doCleanup: false });
  };
}
