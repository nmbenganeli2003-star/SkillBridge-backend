import bcrypt from "bcryptjs";
import { User, Session, Post, Group, Resource } from "./models.js";

export async function seedDemo() {
  if (await User.exists({ email: "sarah@skillbridge.demo" })) return;
  const password = await bcrypt.hash("SkillBridge123!", 12);
  const people: [string, string, number, string[], string[], string, string][] =
    [
      [
        "Sarah Johnson",
        "sarah",
        0,
        ["React", "JavaScript"],
        ["UI/UX Design", "Python"],
        "Computer Science",
        "Programming",
      ],
      [
        "David Kim",
        "david",
        1,
        ["React", "Figma"],
        ["UI/UX Design"],
        "Computer Science",
        "Programming",
      ],
      [
        "Amina Yusuf",
        "amina",
        2,
        ["UI/UX Design", "Figma", "Web Development"],
        ["Machine Learning", "Data Analysis", "Graphic Design"],
        "Software Engineering",
        "Design",
      ],
      [
        "James Lee",
        "james",
        3,
        ["Python", "Data Analysis", "Photoshop"],
        ["Graphic Design", "React"],
        "Mathematics",
        "Programming",
      ],
      [
        "Sofia Martinez",
        "sofia",
        4,
        ["Spanish", "French"],
        ["Web Development"],
        "Modern Languages",
        "Languages",
      ],
      [
        "Daniel Kim",
        "daniel",
        5,
        ["Python", "React", "Machine Learning"],
        ["Figma", "UI/UX Design"],
        "Computer Science",
        "Programming",
      ],
      [
        "Noah Williams",
        "noah",
        6,
        ["Physics", "Calculus"],
        ["Python"],
        "Physics",
        "Sciences",
      ],
      [
        "Chloe Anderson",
        "chloe",
        7,
        ["Marketing", "Public Speaking"],
        ["Graphic Design"],
        "Business Administration",
        "Business",
      ],
    ];
  const users = await User.create(
    people.map(
      ([
        name,
        email,
        avatar,
        skillsOffered,
        skillsWanted,
        major,
        category,
      ]) => ({
        name,
        email: `${email}@skillbridge.demo`,
        password,
        avatar,
        skillsOffered,
        skillsWanted,
        major,
        category,
        rating: 4.8,
        reviewCount: 24,
        bio: "Passionate about technology and design. I love helping others learn and improve their skills. Let’s build something great together!",
      }),
    ),
  );
  const [sarah, david, amina, james] = users;
  const day = (n: number) => new Date(Date.now() + n * 86400000);
  await Session.create([
    {
      title: "React Fundamentals",
      requester: sarah.id,
      recipient: david.id,
      startsAt: day(1),
      duration: 60,
      status: "Confirmed",
      format: "Online",
    },
    {
      title: "UI/UX Design Basics",
      requester: sarah.id,
      recipient: amina.id,
      startsAt: day(3),
      duration: 90,
      status: "Pending",
      format: "Online",
    },
    {
      title: "Python for Data Analysis",
      requester: sarah.id,
      recipient: james.id,
      startsAt: day(5),
      duration: 60,
      status: "Confirmed",
      format: "In person",
    },
    {
      title: "JavaScript Basics",
      requester: sarah.id,
      recipient: david.id,
      startsAt: day(-4),
      duration: 60,
      status: "Completed",
    },
    {
      title: "Web Development",
      requester: sarah.id,
      recipient: amina.id,
      startsAt: day(-8),
      duration: 60,
      status: "Completed",
    },
  ]);
  await Post.create([
    {
      author: david.id,
      title: "Best resources for learning React?",
      body: "I’m looking for great resources to learn React. Any recommendations? I’d love something with hands-on projects to build along the way.",
      tags: ["React", "Resources"],
      likes: [sarah.id, amina.id],
      comments: [
        {
          author: amina.id,
          body: "The interactive tutorials in the official React docs are a great place to start!",
        },
      ],
    },
    {
      author: amina.id,
      title: "A little progress, every single day 🌱",
      body: "Just finished my first full UI design project! A reminder that you don’t have to know everything to start. Who else is working on something new this week?",
      tags: ["Design", "Study Tips"],
      likes: [david.id, james.id, sarah.id],
    },
    {
      author: james.id,
      title: "Looking for a Python study buddy",
      body: "I’m putting together a small weekend study group for data analysis. Beginners are welcome. Let’s figure it out together!",
      tags: ["Python", "Study Group"],
      likes: [amina.id],
    },
  ]);
  await Group.create([
    {
      name: "Python Learners",
      description:
        "From your first script to your next big idea. Learn Python together.",
      category: "Programming",
      members: [david.id, james.id],
    },
    {
      name: "UI/UX Design Community",
      description: "Share your work, get feedback, and grow as a designer.",
      category: "Design",
      members: [amina.id, sarah.id],
    },
    {
      name: "Data Science Hub",
      description: "Find the stories hidden in data.",
      category: "Sciences",
      members: [james.id],
    },
    {
      name: "Web Development",
      description: "Build the web, one project at a time.",
      category: "Programming",
      members: [david.id, amina.id],
    },
  ]);
  await Resource.create([
    {
      title: "Python Cheat Sheet",
      description:
        "A quick reference for Python basics, including syntax, data structures, and useful libraries. Keep it handy for your next project.",
      category: "Programming",
      tags: ["Python", "Programming"],
      author: james.id,
      content:
        '# Python Cheat Sheet\n\n## Variables\nname = "SkillBridge"\ncount = 42\nis_learning = True\n\n## Collections\nskills = ["Python", "Design"]\nprofile = {"name": "Sarah", "year": 3}\n\n## Loops\nfor skill in skills:\n    print(skill)\n\n## Functions\ndef greet(name):\n    return f"Hello, {name}!"\n\n## List comprehensions\nsquares = [x ** 2 for x in range(10)]\n\n## Files\nwith open("notes.txt") as file:\n    notes = file.read()\n\n## Useful libraries\nmath — mathematical functions\njson — JSON encoding and decoding\npathlib — filesystem paths\ncollections — specialized containers\n',
    },
    {
      title: "A Beginner’s Guide to UI/UX",
      description:
        "A practical introduction to user research, wireframes, and thoughtful interface design.",
      category: "Design",
      tags: ["UI/UX Design", "Figma"],
      author: amina.id,
      content:
        "# A Beginner’s Guide to UI/UX\n\n1. Understand the problem. Interview the people who experience it.\n2. Map the user journey and identify friction.\n3. Sketch several low-fidelity solutions.\n4. Build a clickable prototype.\n5. Test with users and iterate.\n\n## Design checklist\n- Clear hierarchy\n- Accessible contrast\n- Consistent spacing\n- Visible focus states\n- Useful empty and error states\n",
    },
    {
      title: "React Study Notes",
      description:
        "Components, props, state, and hooks explained through simple examples.",
      category: "Programming",
      tags: ["React", "JavaScript"],
      author: david.id,
      content:
        "# React Study Notes\n\nComponents are functions that return UI.\nProps pass data from parent to child.\nState stores information between renders.\n\n## Counter\nfunction Counter() {\n  const [count, setCount] = useState(0);\n  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;\n}\n\nUse effects to synchronize with external systems.\nUse stable IDs as list keys.\nKeep state close to the components that use it.\n",
    },
  ]);
  console.log(
    "Demo data ready. Sign in: sarah@skillbridge.demo / SkillBridge123!",
  );
}
