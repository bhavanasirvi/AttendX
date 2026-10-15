import { Router } from "express";
import { protect, adminOnly } from "../middlewares/auth";
import { uploadFace } from "../middlewares/upload";
import { createStaff, listStaff, updateStaff, deleteStaff } from "../controllers/staff.controller";

const router = Router();
router.post("/", protect, adminOnly, uploadFace.single("face"), createStaff);
router.get("/", protect, adminOnly, listStaff);
router.patch("/:id", protect, adminOnly, uploadFace.single("face"), updateStaff);
router.delete("/:id", protect, adminOnly, deleteStaff);

export default router;
