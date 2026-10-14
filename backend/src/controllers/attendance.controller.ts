import { Response } from "express";
import fs from "fs";
import User from "../models/User";
import Attendance from "../models/Attendance";
import { AuthRequest } from "../middlewares/auth";
import { isInsideCampus, isCampusWifi } from "../services/geofence";
import { verifyFace } from "../services/face.service";

const todayIST = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // 2026-10-14

export const markAttendance = async (req: AuthRequest, res: Response) => {
  const selfie = req.file;
  try {
    if (!selfie) return res.status(400).json({ message: "Live selfie required" });

    const { latitude, longitude, wifiSSID, isMockLocation } = req.body;
    const lat = Number(latitude);
    const lon = Number(longitude);

    // 1. fake GPS app pakda gaya toh seedha reject
    if (isMockLocation === "true") {
      return res.status(403).json({ message: "Mock location detected" });
    }

    // 2. already marked?
    const date = todayIST();
    if (await Attendance.findOne({ user: req.user!.id, date })) {
      return res.status(409).json({ message: "Attendance already marked today" });
    }

    // 3. location ya wifi (dono me se ek pass hona chahiye)
    const locationOk = !isNaN(lat) && !isNaN(lon) && isInsideCampus(lat, lon);
    const wifiOk = isCampusWifi(wifiSSID);
    if (!locationOk && !wifiOk) {
      return res.status(403).json({ message: "You are not on campus" });
    }

    // 4. face verify
    const user = await User.findById(req.user!.id);
    if (!user?.faceImagePath) {
      return res.status(400).json({ message: "Face not enrolled" });
    }
    const { match, score } = await verifyFace(user.faceImagePath, selfie.path);
    if (!match) {
      return res.status(403).json({ message: "Face did not match" });
    }

    // 5. mark
    const record = await Attendance.create({
      user: user._id,
      date,
      latitude: lat,
      longitude: lon,
      wifiSSID,
      locationOk,
      wifiOk,
      faceScore: score,
    });

    res.status(201).json({ message: "Attendance marked", markedAt: record.markedAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Something went wrong" });
  } finally {
    if (selfie) fs.unlink(selfie.path, () => {}); // selfie kaam ke baad delete
  }
};

export const todayAttendance = async (_req: AuthRequest, res: Response) => {
  const records = await Attendance.find({ date: todayIST() })
    .populate("user", "name empId")
    .sort({ markedAt: -1 });
  res.json(records);
};