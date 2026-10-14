import bcrypt from "bcryptjs";
import { connectDB } from "./config/db";
import User from "./models/User";

(async () => {
  await connectDB();
  const exists = await User.findOne({ empId: "admin" });
  if (!exists) {
    await User.create({
      name: "Admin",
      empId: "admin",
      password: await bcrypt.hash("admin123", 10),
      role: "admin",
    });
    console.log("Admin created: admin / admin123");
  } else {
    console.log("Admin already exists");
  }
  process.exit(0);
})();