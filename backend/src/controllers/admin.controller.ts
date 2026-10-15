import { Response } from "express";
import fs from "fs/promises";
import path from "path";
import { AuthRequest } from "../middlewares/auth";
import { campus } from "../config/campus";
import { getAttendanceSettings } from "../services/attendance-settings";
import AppSettings from "../models/AppSettings";

const brandingDir = path.resolve(__dirname, "../../uploads/branding");
const logoNames = ["brand-logo.png", "brand-logo.jpg", "brand-logo.webp"];

export const getBranding = async (_req: AuthRequest, res: Response) => {
  try {
    const existing = await Promise.all(logoNames.map(async (name) => {
      try { await fs.access(path.join(brandingDir, name)); return name; } catch { return null; }
    }));
    const logoName = existing.find(Boolean);
    const protocol = String(_req.headers["x-forwarded-proto"] || _req.protocol).split(",")[0].trim();
    const base = `${protocol}://${_req.get("host")}`;
    return res.json({ logoUrl: logoName ? `${base}/uploads/branding/${logoName}?v=${(await fs.stat(path.join(brandingDir, logoName))).mtimeMs}` : null });
  } catch {
    return res.json({ logoUrl: null });
  }
};

export const uploadAdminLogo = async (req: AuthRequest, res: Response) => {
  const file = req.file;
  if (!file) return res.status(400).json({ message: "Choose a logo image to upload" });
  const bytes = file.buffer;
  const png = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpg && !webp) return res.status(400).json({ message: "Image file is invalid. Use PNG, JPG, or WebP." });
  const ext = png ? "png" : jpg ? "jpg" : "webp";
  try {
    await fs.mkdir(brandingDir, { recursive: true });
    await fs.writeFile(path.join(brandingDir, `brand-logo.${ext}`), bytes);
    await Promise.all(logoNames.filter((name) => name !== `brand-logo.${ext}`).map((name) => fs.rm(path.join(brandingDir, name), { force: true })));
    const protocol = String(req.headers["x-forwarded-proto"] || req.protocol).split(",")[0].trim();
    return res.json({ message: "AttendX logo updated", logoUrl: `${protocol}://${req.get("host")}/uploads/branding/brand-logo.${ext}?v=${Date.now()}` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not save AttendX logo" });
  }
};

export const getAdminSettings = async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await getAttendanceSettings();
    return res.json({ campusName: campus.name, allowedSSID: settings.allowedSSIDs[0] || "" });
  } catch {
    return res.status(500).json({ message: "Could not load attendance settings" });
  }
};

export const updateAdminSettings = async (req: AuthRequest, res: Response) => {
  const allowedSSID = String(req.body.allowedSSID || "").trim();
  if (!allowedSSID || allowedSSID.length > 32 || /[\r\n]/.test(allowedSSID)) {
    return res.status(400).json({ message: "Enter a valid Wi-Fi SSID (1–32 characters)" });
  }
  try {
    await AppSettings.findOneAndUpdate(
      { key: "attendance" },
      { $set: { allowedSSIDs: [allowedSSID] } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return res.json({ message: "Allowed Wi-Fi updated", campusName: campus.name, allowedSSID });
  } catch {
    return res.status(500).json({ message: "Could not save attendance settings" });
  }
};
