import { Router } from "express";
import { protect, adminOnly } from "../middlewares/auth";
import { uploadSelfie } from "../middlewares/upload";
import { markAttendance, todayAttendance } from "../controllers/attendance.controller";

const router = Router();
router.post("/mark", protect, uploadSelfie.single("selfie"), markAttendance);
router.get("/today", protect, adminOnly, todayAttendance);

export default router;