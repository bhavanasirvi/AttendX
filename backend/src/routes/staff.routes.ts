import { Router } from "express";
import { protect, adminOnly } from "../middlewares/auth";
import { uploadFace } from "../middlewares/upload";
import { createStaff, listStaff } from "../controllers/staff.controller";

const router = Router();
router.post("/", protect, adminOnly, uploadFace.single("face"), createStaff);
router.get("/", protect, adminOnly, listStaff);

export default router;