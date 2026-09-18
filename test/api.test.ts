import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { createApp } from "../src/app.js";
import { Group, Session, User } from "../src/models.js";

const app = createApp({
  secret: "integration-test-secret-with-at-least-32-characters",
});
const alice = request.agent(app);
const bob = request.agent(app);
const stranger = request.agent(app);
let database: MongoMemoryServer;
let aliceId: string;
let bobId: string;
let sessionId: string;
let postId: string;
let resourceId: string;

before(async () => {
  database = await MongoMemoryServer.create();
  await mongoose.connect(database.getUri("skillbridge_test"));
});
after(async () => {
  await mongoose.disconnect();
  await database?.stop();
});

test("registration validates input, hashes passwords, and sets a private session cookie", async () => {
  await alice
    .post("/api/auth/register")
    .send({
      name: "Alice",
      email: "invalid",
      password: "short",
      major: "Design",
    })
    .expect(400);
  const response = await alice
    .post("/api/auth/register")
    .send({
      name: "Alice Learner",
      email: "alice@example.com",
      password: "StrongPassword123!",
      major: "Design",
    })
    .expect(201);
  aliceId = response.body._id;
  assert.equal(response.body.password, undefined);
  assert.match(response.headers["set-cookie"][0], /HttpOnly/);
  const stored = await User.findById(aliceId).select("+password");
  assert.notEqual(stored!.password, "StrongPassword123!");
  assert.match(stored!.password, /^\$2/);
  await alice
    .post("/api/auth/register")
    .send({
      name: "Alice",
      email: "ALICE@example.com",
      password: "StrongPassword123!",
      major: "Design",
    })
    .expect(409);
  bobId = (
    await bob
      .post("/api/auth/register")
      .send({
        name: "Bob Learner",
        email: "bob@example.com",
        password: "StrongPassword123!",
        major: "Programming",
      })
      .expect(201)
  ).body._id;
  await stranger
    .post("/api/auth/register")
    .send({
      name: "Other Learner",
      email: "other@example.com",
      password: "StrongPassword123!",
      major: "Math",
    })
    .expect(201);
});

test("authentication, input validation, and origin checks protect the API", async () => {
  await request(app).get("/api/users").expect(401);
  await request(app)
    .post("/api/auth/login")
    .send({ email: "alice@example.com", password: "wrong" })
    .expect(401);
  await alice
    .patch("/api/users/me")
    .set("Origin", "https://untrusted.example")
    .send({ name: "Changed" })
    .expect(403);
  await alice.get("/api/users/not-an-id").expect(400);
  await alice
    .patch("/api/users/me")
    .send({ skillsOffered: ["Figma"], skillsWanted: ["TypeScript"] })
    .expect(200);
  await bob
    .patch("/api/users/me")
    .send({ skillsOffered: ["TypeScript"], skillsWanted: ["Figma"] })
    .expect(200);
  const result = await alice.get("/api/users?q=TypeScript").expect(200);
  assert.equal(result.body.length, 1);
  assert.equal(result.body[0]._id, bobId);
  assert.equal(result.body[0].email, undefined);
  assert.equal(result.body[0].password, undefined);
  assert.ok(result.body[0].match > 60);
});

test("connecting is persistent and does not create duplicate connections", async () => {
  await alice.post(`/api/users/${bobId}/connect`).expect(200);
  await alice.post(`/api/users/${bobId}/connect`).expect(200);
  const me = await alice.get("/api/auth/me").expect(200);
  assert.deepEqual(me.body.connections, [bobId]);
  const notices = await bob.get("/api/notifications").expect(200);
  assert.equal(notices.body.length, 1);
  await bob.patch("/api/notifications/read").expect(200);
  assert.ok(
    (await bob.get("/api/notifications")).body.every(
      (n: { read: boolean }) => n.read,
    ),
  );
});

test("session requests enforce ownership, recipient acceptance, and valid transitions", async () => {
  const session = {
    recipient: bobId,
    title: "TypeScript fundamentals",
    startsAt: new Date(Date.now() + 86400000).toISOString(),
    duration: 60,
    format: "Online",
  };
  await alice
    .post("/api/sessions")
    .send({ ...session, startsAt: new Date(0).toISOString() })
    .expect(400);
  await alice
    .post("/api/sessions")
    .send({ ...session, recipient: aliceId })
    .expect(400);
  sessionId = (await alice.post("/api/sessions").send(session).expect(201)).body
    ._id;
  await alice
    .patch(`/api/sessions/${sessionId}`)
    .send({ status: "Confirmed" })
    .expect(403);
  await stranger
    .patch(`/api/sessions/${sessionId}`)
    .send({ status: "Cancelled" })
    .expect(404);
  assert.equal((await stranger.get("/api/sessions")).body.length, 0);
  await bob
    .patch(`/api/sessions/${sessionId}`)
    .send({ status: "Confirmed" })
    .expect(200);
  await bob
    .patch(`/api/sessions/${sessionId}`)
    .send({ status: "Completed" })
    .expect(400);
  await Session.updateOne(
    { _id: sessionId },
    { startsAt: new Date(Date.now() - 3600000) },
  );
  await alice
    .patch(`/api/sessions/${sessionId}`)
    .send({ status: "Completed" })
    .expect(200);
  await alice
    .patch(`/api/sessions/${sessionId}`)
    .send({ status: "Cancelled" })
    .expect(409);
});

test("community posts support persistent likes and comments with populated authors", async () => {
  postId = (
    await alice
      .post("/api/posts")
      .send({
        title: "A useful TypeScript discovery",
        body: "Try narrowing unknown values before accessing properties.",
        tags: ["TypeScript"],
      })
      .expect(201)
  ).body._id;
  assert.ok(postId);
  let likes = await bob.post(`/api/posts/${postId}/like`).expect(200);
  assert.deepEqual(likes.body.likes, [bobId]);
  likes = await bob.post(`/api/posts/${postId}/like`).expect(200);
  assert.equal(likes.body.likes.length, 0);
  const comments = await bob
    .post(`/api/posts/${postId}/comments`)
    .send({ body: "That makes sense. Thank you!" })
    .expect(201);
  assert.equal(comments.body.comments[0].author.name, "Bob Learner");
  assert.equal(comments.body.comments[0].author.email, undefined);
  await bob
    .post(`/api/posts/${postId}/comments`)
    .send({ body: "  " })
    .expect(400);
});

test("group membership can be joined and left", async () => {
  const group = await Group.create({
    name: "TypeScript learners",
    members: [],
  });
  assert.deepEqual(
    (await alice.post(`/api/groups/${group.id}/join`).expect(200)).body.members,
    [aliceId],
  );
  assert.deepEqual(
    (await alice.post(`/api/groups/${group.id}/join`).expect(200)).body.members,
    [],
  );
});

test("resources can be created, saved, and downloaded as actual Markdown", async () => {
  resourceId = (
    await alice
      .post("/api/resources")
      .send({
        title: "TypeScript Notes",
        description: "Useful patterns",
        tags: ["TypeScript"],
        category: "Programming",
        content: "# Notes\n\nUse unknown at system boundaries.",
      })
      .expect(201)
  ).body._id;
  await bob.post(`/api/resources/${resourceId}/save`).expect(200);
  assert.deepEqual((await bob.get("/api/auth/me")).body.savedResources, [
    resourceId,
  ]);
  const download = await bob
    .get(`/api/resources/${resourceId}/download`)
    .expect(200);
  assert.match(
    download.headers["content-disposition"],
    /attachment; filename="TypeScript-Notes.md"/,
  );
  assert.match(download.text, /Use unknown/);
  assert.equal(
    (await bob.get(`/api/resources/${resourceId}`)).body.downloads,
    1,
  );
  await bob.post(`/api/resources/${resourceId}/save`).expect(200);
  assert.deepEqual((await bob.get("/api/auth/me")).body.savedResources, []);
});

test("messages are visible only to participants and create a recipient notification", async () => {
  await alice
    .post(`/api/messages/${bobId}`)
    .send({ body: "Ready for our next session?" })
    .expect(201);
  const conversation = await bob.get(`/api/messages/${aliceId}`).expect(200);
  assert.equal(conversation.body[0].body, "Ready for our next session?");
  assert.equal(conversation.body[0].read, true);
  assert.equal((await stranger.get(`/api/messages/${aliceId}`)).body.length, 0);
  const notices = await bob.get("/api/notifications");
  assert.ok(
    notices.body.some((n: { text: string }) =>
      n.text.includes("sent you a message"),
    ),
  );
});

test("reviews require a completed shared session and update the recipient rating", async () => {
  await stranger
    .post(`/api/sessions/${sessionId}/review`)
    .send({ rating: 5, body: "Not a participant" })
    .expect(403);
  await alice
    .post(`/api/sessions/${sessionId}/review`)
    .send({ rating: 6, body: "Out of range" })
    .expect(400);
  await alice
    .post(`/api/sessions/${sessionId}/review`)
    .send({ rating: 5, body: "A wonderful learning partner." })
    .expect(201);
  await alice
    .post(`/api/sessions/${sessionId}/review`)
    .send({ rating: 4, body: "Duplicate" })
    .expect(409);
  const profile = await alice.get(`/api/users/${bobId}`).expect(200);
  assert.equal(profile.body.rating, 5);
  assert.equal(profile.body.reviewCount, 1);
  const reviews = await alice.get(`/api/users/${bobId}/reviews`).expect(200);
  assert.equal(reviews.body[0].author.name, "Alice Learner");
});

test("logout clears the cookie and revokes access in the current browser", async () => {
  await alice.post("/api/auth/logout").expect(200);
  await alice.get("/api/auth/me").expect(401);
});
