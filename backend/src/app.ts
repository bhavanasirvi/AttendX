import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", app: "AttendX" });
});

// routes yahan mount honge (aage add karenge)
app.use("/api/auth", authRoutes);
// app.use("/api/staff", staffRoutes);
// app.use("/api/attendance", attendanceRoutes);

export default app;