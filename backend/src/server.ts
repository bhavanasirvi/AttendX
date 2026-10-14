import app from "./app";
import { connectDB } from "./config/db";
import { env } from "./config/env";

const start = async () => {
  await connectDB();
  app.listen(env.PORT, "0.0.0.0", () => {
    console.log(`AttendX backend running on port ${env.PORT}`);
  });
};

start();