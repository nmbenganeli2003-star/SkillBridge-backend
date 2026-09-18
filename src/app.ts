import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { z } from "zod";
import {
  User,
  Session,
  Post,
  Group,
  Resource,
  Message,
  Notification,
  Review,
} from "./models.js";

export function createApp({
  secret,
  origin = "http://localhost:5173",
  production = false,
}: {
  secret: string | undefined;
  origin?: string;
  production?: boolean;
}) {
  if (!secret || secret.length < 32)
    throw new Error("JWT_SECRET must contain at least 32 characters.");
  const app = express();
  app.use(
    helmet(),
    cors({ origin, credentials: true }),
    express.json({ limit: "100kb" }),
    cookieParser(),
  );
  app.use(
    "/api",
    (req, res, next) => {
      if (
        !["GET", "HEAD", "OPTIONS", "POST", "PUT", "DELETE"].includes(req.method) &&
        req.headers.origin &&
        req.headers.origin !== origin
      )
        return res.status(403).json({ error: "Untrusted request origin." });
      next();
    },
    rateLimit({
      windowMs: 60000,
      limit: 240,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  const fail = (status: number, message: string) =>
    Object.assign(new Error(message), { status });
  const id = (value: unknown) => {
    if (!mongoose.isValidObjectId(value)) throw fail(400, "Invalid ID.");
    return String(value);
  };
  const parse = <T extends z.ZodType>(schema: T, req: Request): z.output<T> =>
    schema.parse(req.body);
  const text = (max = 200) => z.string().trim().min(1).max(max);
  const publicUser = (user: InstanceType<typeof User>) => {
    const value = user.toObject();
    const {
      password: _password,
      email: _email,
      connections: _connections,
      savedResources: _saved,
      ...profile
    } = value;
    return profile;
  };
  const cookie = {
    httpOnly: true,
    secure: production,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 7 * 86400000,
  };
  const signIn = (res: Response, user: InstanceType<typeof User>) =>
    res.cookie(
      "sb_session",
      jwt.sign({ sub: user.id }, secret!, { expiresIn: "7d" }),
      cookie,
    );
  const auth = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = jwt.verify(
        req.cookies.sb_session || "",
        secret!,
      ) as jwt.JwtPayload;
      const user = await User.findById(token.sub);
      if (!user) throw new Error();
      req.user = user;
    } catch {
      return res.status(401).json({ error: "Please sign in to continue." });
    }
    next();
  };
  const notify = (user: unknown, message: string, link: string) =>
    Notification.create({ user, text: message, link });
  app.get("/api/health", (req, res) =>
    res.json({
      status: mongoose.connection.readyState === 1 ? "ok" : "unavailable",
      database: "mongodb",
    }),
  );
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 40,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  app.post("/api/auth/register", authLimit, async (req, res) => {
    const data = parse(
      z.object({
        name: text(80),
        email: z
          .email()
          .max(254)
          .transform((v) => v.toLowerCase()),
        password: z.string().min(8).max(128),
        major: text(100),
      }),
      req,
    );
    if (await User.exists({ email: data.email }))
      throw fail(409, "An account with this email already exists.");
    const user = await User.create({
      ...data,
      password: await bcrypt.hash(data.password, 12),
    });
    signIn(res, user);
    const safe = user.toObject();
    Reflect.deleteProperty(safe, "password");
    res.status(201).json(safe);
  });
  app.post("/api/auth/login", authLimit, async (req, res) => {
    const data = parse(
      z.object({
        email: z.email().transform((v) => v.toLowerCase()),
        password: text(128),
      }),
      req,
    );
    const user = await User.findOne({ email: data.email }).select("+password");
    if (!user || !(await bcrypt.compare(data.password, user.password)))
      throw fail(401, "Email or password is incorrect.");
    signIn(res, user);
    const safe = user.toObject();
    Reflect.deleteProperty(safe, "password");
    res.json(safe);
  });
  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("sb_session", { ...cookie, maxAge: undefined });
    res.json({ ok: true });
  });
  app.get("/api/auth/session", async (req, res) => {
    try {
      const token = jwt.verify(
        req.cookies.sb_session || "",
        secret!,
      ) as jwt.JwtPayload;
      const user = await User.findById(token.sub);
      res.json(user);
    } catch {
      res.json(null);
    }
  });
  app.get("/api/auth/me", auth, (req, res) => res.json(req.user));
  app.patch("/api/users/me", auth, async (req, res) => {
    const data = parse(
      z
        .object({
          name: text(80),
          major: text(100),
          university: text(120),
          year: text(40),
          bio: z.string().trim().max(1000),
          location: text(100),
          availability: text(200),
          skillsOffered: z.array(text(40)).max(12),
          skillsWanted: z.array(text(40)).max(12),
          category: z.enum([
            "Programming",
            "Design",
            "Languages",
            "Sciences",
            "Business",
            "Arts & Others",
          ]),
        })
        .partial(),
      req,
    );
    Object.assign(req.user, data);
    await req.user.save();
    res.json(req.user);
  });
  app.get("/api/users", auth, async (req, res) => {
    const q = String(req.query.q || "")
      .slice(0, 100)
      .toLowerCase();
    const people = await User.find({ _id: { $ne: req.user.id } }).limit(200);
    const results = people
      .filter(
        (p) =>
          (!req.query.category || p.category === req.query.category) &&
          (!req.query.location || p.location === req.query.location) &&
          (!q ||
            [p.name, p.major, ...p.skillsOffered, ...p.skillsWanted]
              .join(" ")
              .toLowerCase()
              .includes(q)),
      )
      .map((p) => {
        const overlap =
          p.skillsOffered.filter((s) => req.user.skillsWanted.includes(s))
            .length +
          p.skillsWanted.filter((s) => req.user.skillsOffered.includes(s))
            .length;
        return {
          ...publicUser(p),
          match: Math.min(99, 60 + overlap * 9),
          connected: req.user.connections.some((c) => c.equals(p._id)),
        };
      })
      .sort((a, b) => b.match - a.match);
    res.json(results);
  });
  app.get("/api/users/:id", auth, async (req, res) => {
    const user = await User.findById(id(req.params.id));
    if (!user) throw fail(404, "Profile not found.");
    res.json({
      ...publicUser(user),
      connected: req.user.connections.some((c) => c.equals(user._id)),
    });
  });
  app.post("/api/users/:id/connect", auth, async (req, res) => {
    const peer = await User.findById(id(req.params.id));
    if (!peer || peer.id === req.user.id)
      throw fail(400, "Choose another learner to connect with.");
    const exists = req.user.connections.some((c) => c.equals(peer._id));
    if (!exists) {
      await User.updateOne(
        { _id: req.user.id },
        { $addToSet: { connections: peer.id } },
      );
      await notify(
        peer.id,
        `${req.user.name} connected with you.`,
        `/profile/${req.user.id}`,
      );
    }
    res.json({ connected: true });
  });
  app.get("/api/sessions", auth, async (req, res) =>
    res.json(
      await Session.find({
        $or: [{ requester: req.user.id }, { recipient: req.user.id }],
      })
        .populate("requester recipient", "name avatar major")
        .sort({ startsAt: 1 }),
    ),
  );
  app.post("/api/sessions", auth, async (req, res) => {
    const data = parse(
      z.object({
        recipient: text(),
        title: text(120),
        startsAt: z.iso.datetime(),
        duration: z.number().int().min(15).max(240),
        format: z.enum(["Online", "In person"]),
        notes: z.string().max(1000).optional(),
      }),
      req,
    );
    if (new Date(data.startsAt) <= new Date())
      throw fail(400, "Choose a future date and time.");
    if (
      id(data.recipient) === req.user.id ||
      !(await User.exists({ _id: data.recipient }))
    )
      throw fail(400, "Choose another learner.");
    const session = await Session.create({ ...data, requester: req.user.id });
    await notify(
      data.recipient,
      `${req.user.name} requested a session: ${data.title}.`,
      "/sessions",
    );
    res.status(201).json(session);
  });
  app.patch("/api/sessions/:id", auth, async (req, res) => {
    const { status } = parse(
      z.object({ status: z.enum(["Confirmed", "Completed", "Cancelled"]) }),
      req,
    );
    const session = await Session.findOne({
      _id: id(req.params.id),
      $or: [{ requester: req.user.id }, { recipient: req.user.id }],
    });
    if (!session) throw fail(404, "Session not found.");
    if (["Completed", "Cancelled"].includes(session.status))
      throw fail(409, "This session is already closed.");
    if (
      status === "Confirmed" &&
      (session.status !== "Pending" ||
        String(session.recipient) !== req.user.id)
    )
      throw fail(403, "Only the invited learner can accept this request.");
    if (
      status === "Completed" &&
      (session.status !== "Confirmed" ||
        !session.startsAt ||
        session.startsAt > new Date())
    )
      throw fail(400, "You can complete a confirmed session after it starts.");
    session.status = status;
    await session.save();
    await notify(
      String(session.requester) === req.user.id
        ? session.recipient
        : session.requester,
      `${session.title} was ${status.toLowerCase()}.`,
      "/sessions",
    );
    res.json(session);
  });
  app.get("/api/users/:id/reviews", auth, async (req, res) => {
    res.json(
      await Review.find({ recipient: id(req.params.id) })
        .populate("author", "name avatar")
        .sort({ createdAt: -1 }),
    );
  });
  app.post("/api/sessions/:id/review", auth, async (req, res) => {
    const data = parse(
      z.object({ rating: z.number().int().min(1).max(5), body: text(1000) }),
      req,
    );
    const session = await Session.findOne({
      _id: id(req.params.id),
      status: "Completed",
      $or: [{ requester: req.user.id }, { recipient: req.user.id }],
    });
    if (!session)
      throw fail(
        403,
        "You can only review a completed session you participated in.",
      );
    const recipient =
      String(session.requester) === req.user.id
        ? session.recipient
        : session.requester;
    if (await Review.exists({ session: session.id, author: req.user.id }))
      throw fail(409, "You have already reviewed this session.");
    const review = await Review.create({
      ...data,
      session: session.id,
      author: req.user.id,
      recipient,
    });
    const ratings = await Review.aggregate([
      { $match: { recipient } },
      {
        $group: { _id: null, rating: { $avg: "$rating" }, count: { $sum: 1 } },
      },
    ]);
    await User.updateOne(
      { _id: recipient },
      {
        rating: Math.round(ratings[0].rating * 10) / 10,
        reviewCount: ratings[0].count,
      },
    );
    res.status(201).json(review);
  });
  app.get("/api/posts", auth, async (req, res) =>
    res.json(
      await Post.find()
        .populate("author", "name avatar major")
        .populate("comments.author", "name avatar")
        .sort({ createdAt: -1 })
        .limit(100),
    ),
  );
  app.post("/api/posts", auth, async (req, res) => {
    const data = parse(
      z.object({
        title: text(140),
        body: text(3000),
        tags: z.array(text(30)).max(4),
      }),
      req,
    );
    const post = new Post({ ...data, author: req.user.id });
    await post.save();
    res
      .status(201)
      .json(
        await Post.findById(post._id).populate("author", "name avatar major"),
      );
  });
  app.post("/api/posts/:id/like", auth, async (req, res) => {
    const post = await Post.findById(id(req.params.id));
    if (!post) throw fail(404, "Discussion not found.");
    const liked = post.likes.some((u) => u.equals(req.user._id));
    const result = await Post.findByIdAndUpdate(
      post.id,
      liked
        ? { $pull: { likes: req.user.id } }
        : { $addToSet: { likes: req.user.id } },
      { new: true },
    );
    res.json({ likes: result!.likes });
  });
  app.post("/api/posts/:id/comments", auth, async (req, res) => {
    const { body } = parse(z.object({ body: text(1000) }), req);
    const post = await Post.findByIdAndUpdate(
      id(req.params.id),
      { $push: { comments: { author: req.user.id, body } } },
      { new: true },
    )
      .populate("author", "name avatar major")
      .populate("comments.author", "name avatar");
    if (!post) throw fail(404, "Discussion not found.");
    res.status(201).json(post);
  });
  app.get("/api/groups", auth, async (req, res) =>
    res.json(await Group.find()),
  );
  app.post("/api/groups/:id/join", auth, async (req, res) => {
    const group = await Group.findById(id(req.params.id));
    if (!group) throw fail(404, "Group not found.");
    const joined = group.members.some((m) => m.equals(req.user._id));
    res.json(
      await Group.findByIdAndUpdate(
        group.id,
        joined
          ? { $pull: { members: req.user.id } }
          : { $addToSet: { members: req.user.id } },
        { new: true },
      ),
    );
  });
  app.get("/api/resources", auth, async (req, res) =>
    res.json(
      await Resource.find()
        .select("-content")
        .populate("author", "name avatar major")
        .sort({ createdAt: -1 }),
    ),
  );
  app.post("/api/resources", auth, async (req, res) => {
    const data = parse(
      z.object({
        title: text(120),
        description: text(1000),
        category: text(40),
        tags: z.array(text(30)).max(4),
        content: text(30000),
      }),
      req,
    );
    res
      .status(201)
      .json(await Resource.create({ ...data, author: req.user.id }));
  });
  app.get("/api/resources/:id", auth, async (req, res) => {
    const resource = await Resource.findById(id(req.params.id)).populate(
      "author",
      "name avatar major",
    );
    if (!resource) throw fail(404, "Resource not found.");
    res.json(resource);
  });
  app.get("/api/resources/:id/download", auth, async (req, res) => {
    const resource = await Resource.findByIdAndUpdate(
      id(req.params.id),
      { $inc: { downloads: 1 } },
      { new: true },
    );
    if (!resource) throw fail(404, "Resource not found.");
    res
      .set(
        "Content-Disposition",
        `attachment; filename="${(resource.title || "resource").replace(/[^a-z0-9]/gi, "-").slice(0, 80)}.md"`,
      )
      .type("text/markdown")
      .send(resource.content);
  });
  app.post("/api/resources/:id/save", auth, async (req, res) => {
    const resourceId = id(req.params.id);
    if (!(await Resource.exists({ _id: resourceId })))
      throw fail(404, "Resource not found.");
    const saved = req.user.savedResources.some((r) => String(r) === resourceId);
    await User.updateOne(
      { _id: req.user.id },
      saved
        ? { $pull: { savedResources: resourceId } }
        : { $addToSet: { savedResources: resourceId } },
    );
    res.json({ saved: !saved });
  });
  app.get("/api/messages/:id", auth, async (req, res) => {
    const peer = id(req.params.id);
    await Message.updateMany(
      { sender: peer, recipient: req.user.id },
      { read: true },
    );
    res.json(
      await Message.find({
        $or: [
          { sender: req.user.id, recipient: peer },
          { sender: peer, recipient: req.user.id },
        ],
      })
        .sort({ createdAt: 1 })
        .limit(200),
    );
  });
  app.post("/api/messages/:id", auth, async (req, res) => {
    const { body } = parse(z.object({ body: text(2000) }), req);
    const peer = id(req.params.id);
    if (peer === req.user.id || !(await User.exists({ _id: peer })))
      throw fail(400, "Recipient not found.");
    const message = await Message.create({
      sender: req.user.id,
      recipient: peer,
      body,
    });
    await notify(
      peer,
      `${req.user.name} sent you a message.`,
      `/profile/${req.user.id}?message=1`,
    );
    res.status(201).json(message);
  });
  app.get("/api/notifications", auth, async (req, res) =>
    res.json(
      await Notification.find({ user: req.user.id })
        .sort({ createdAt: -1 })
        .limit(50),
    ),
  );
  app.patch("/api/notifications/read", auth, async (req, res) => {
    await Notification.updateMany(
      { user: req.user.id, read: false },
      { read: true },
    );
    res.json({ ok: true });
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  app.use(
    (
      error: Error & { code?: number; status?: number },
      _req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      if (error instanceof z.ZodError)
        return res.status(400).json({
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        });
      if (error.code === 11000)
        return res.status(409).json({ error: "This record already exists." });
      const status = error.status || 500;
      if (status === 500) console.error(error);
      res.status(status).json({
        error:
          status === 500
            ? "Something went wrong. Please try again."
            : error.message,
      });
    },
  );
  return app;
}
