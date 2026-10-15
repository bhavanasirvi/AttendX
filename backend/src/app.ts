import express, { ErrorRequestHandler } from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import authRoutes from "./routes/auth.routes";
import staffRoutes from "./routes/staff.routes";
import attendanceRoutes from "./routes/attendance.routes";
import adminRoutes from "./routes/admin.routes";


const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", app: "AttendX" });
});

// routes yahan mount honge (aage add karenge)
app.use("/api/auth", authRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/admin", adminRoutes);

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

const adminWebRoot = path.join(__dirname, "../public/admin");
app.get("/admin", (_req, res) => res.sendFile(path.join(adminWebRoot, "index.html")));
app.use("/admin", express.static(adminWebRoot));

const uploadErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const tooLarge = err.code === "LIMIT_FILE_SIZE";
    return res.status(tooLarge ? 413 : 400).json({
      message: tooLarge
        ? `${err.field || "Uploaded file"} is too large. Record a shorter clip and retry.`
        : `Upload failed: ${err.message}`,
    });
  }
  console.error(err);
  return res.status(500).json({ message: "Unexpected server error" });
};

app.use(uploadErrorHandler);

export default app;
