import type { User } from "./models.js";
declare global {
  namespace Express {
    interface Request {
      user: InstanceType<typeof User>;
    }
  }
}
export {};
