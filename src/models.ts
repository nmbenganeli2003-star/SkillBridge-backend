import mongoose from "mongoose";

const { Schema, model } = mongoose;
const ref = (name: string) => ({ type: Schema.Types.ObjectId, ref: name });
const options = { timestamps: true };
const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true, select: false },
    major: { type: String, default: "Computer Science" },
    university: { type: String, default: "University of Yaoundé I" },
    year: { type: String, default: "3rd Year" },
    bio: {
      type: String,
      default: "Excited to share what I know and learn something new.",
    },
    location: { type: String, default: "Yaoundé, Cameroon" },
    avatar: { type: Number, default: 0 },
    skillsOffered: { type: [String], default: [] },
    skillsWanted: { type: [String], default: [] },
    availability: { type: String, default: "Weekdays, 4:00 PM – 7:00 PM" },
    category: { type: String, default: "Programming" },
    rating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    connections: [ref("User")],
    savedResources: [ref("Resource")],
  },
  options,
);
export const User = model("User", userSchema);
export const Session = model(
  "Session",
  new Schema(
    {
      title: String,
      requester: ref("User"),
      recipient: ref("User"),
      startsAt: Date,
      duration: Number,
      format: {
        type: String,
        enum: ["Online", "In person"],
        default: "Online",
      },
      status: {
        type: String,
        enum: ["Pending", "Confirmed", "Completed", "Cancelled"],
        default: "Pending",
      },
      notes: String,
    },
    options,
  ),
);
export const Post = model(
  "Post",
  new Schema(
    {
      author: ref("User"),
      title: String,
      body: String,
      tags: [String],
      likes: [ref("User")],
      comments: [
        {
          author: ref("User"),
          body: String,
          createdAt: { type: Date, default: Date.now },
        },
      ],
    },
    options,
  ),
);
export const Group = model(
  "Group",
  new Schema(
    {
      name: String,
      description: String,
      category: String,
      members: [ref("User")],
    },
    options,
  ),
);
export const Resource = model(
  "Resource",
  new Schema(
    {
      title: String,
      description: String,
      category: String,
      tags: [String],
      author: ref("User"),
      content: String,
      downloads: { type: Number, default: 0 },
    },
    options,
  ),
);
export const Message = model(
  "Message",
  new Schema(
    {
      sender: ref("User"),
      recipient: ref("User"),
      body: String,
      read: { type: Boolean, default: false },
    },
    options,
  ),
);
export const Notification = model(
  "Notification",
  new Schema(
    {
      user: ref("User"),
      text: String,
      link: String,
      read: { type: Boolean, default: false },
    },
    options,
  ),
);
const reviewSchema = new Schema(
  {
    session: ref("Session"),
    author: ref("User"),
    recipient: ref("User"),
    rating: { type: Number, required: true, min: 1, max: 5 },
    body: { type: String, required: true },
  },
  options,
);
reviewSchema.index({ session: 1, author: 1 }, { unique: true });
export const Review = model("Review", reviewSchema);
