import { Router } from "express";
import { adminOnly, protect } from "../middlewares/auth";
import { getAdminSettings, updateAdminSettings, getBranding, uploadAdminLogo } from "../controllers/admin.controller";
import { uploadBrandLogo } from "../middlewares/upload";

const router = Router();
router.get("/branding", getBranding);
router.post("/logo", protect, adminOnly, uploadBrandLogo, uploadAdminLogo);
router.get("/settings", protect, adminOnly, getAdminSettings);
router.patch("/settings", protect, adminOnly, updateAdminSettings);

export default router;
