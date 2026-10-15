import { Router } from "express";
import { protect, adminOnly } from "../middlewares/auth";
import { uploadAttendance } from "../middlewares/upload";
import {
  markAttendance,
  checkOut,
  todayAttendance,
  myTodayAttendance,
  myAttendanceHistory,
  verifyFaceOnly,
  verifyLocationOnly,
} from "../controllers/attendance.controller";

const router = Router();
router.post("/mark", protect, uploadAttendance, markAttendance);
router.post("/verify-face", protect, uploadAttendance, verifyFaceOnly);
router.post("/check-location", protect, verifyLocationOnly);
router.get("/me/today", protect, myTodayAttendance);
router.get("/me/history", protect, myAttendanceHistory);
router.get("/today", protect, adminOnly, todayAttendance);
router.post("/checkout", protect, uploadAttendance, checkOut);

export default router;
