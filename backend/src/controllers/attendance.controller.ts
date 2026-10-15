import { Response } from "express";
import fs from "fs";
import User from "../models/User";
import Attendance from "../models/Attendance";
import { AuthRequest } from "../middlewares/auth";
import { isInsideCampus, isCampusWifi } from "../services/geofence";
import { verifyFace } from "../services/face.service";
import { campus } from "../config/campus";
import { todayIST } from "../utils/time";
import { getAttendanceSettings } from "../services/attendance-settings";

type Presence =
  | { ok: false; status: number; message: string }
  | { ok: true; lat: number; lon: number; accuracyMeters: number; campusName: string; wifiSSID?: string; locationOk: boolean; wifiOk: boolean; score: number };
type FaceCheck = { ok: false; status: number; message: string } | { ok: true; score: number };

type AttendanceFiles = { selfie?: Express.Multer.File[]; blink?: Express.Multer.File[]; left?: Express.Multer.File[]; right?: Express.Multer.File[] };

const getAttendanceFiles = (req: AuthRequest) =>
  (req.files as AttendanceFiles | undefined) ?? {};

const removeAttendanceFiles = (req: AuthRequest) => {
  const files = Object.values(getAttendanceFiles(req)).flat();
  files.forEach((file) => fs.unlink(file.path, () => {}));
};

const verifyUploadedFace = async (req: AuthRequest): Promise<FaceCheck> => {
  const files = getAttendanceFiles(req);
  const selfie = files.selfie?.[0];
  const blink = files.blink?.[0];
  const left = files.left?.[0];
  const right = files.right?.[0];
  if (!selfie || !blink || !left || !right) {
    return { ok: false, status: 400, message: "Selfie and blink/left/right liveness clips required" };
  }

  const user = await User.findById(req.user!.id);
  if (!user?.faceImagePath) {
    return { ok: false, status: 400, message: "Face not enrolled" };
  }
  const { match, score, reason, message: livenessMessage, failedChallenge } = await verifyFace(
    user.faceImagePath,
    selfie.path,
    { blink: blink.path, left: left.path, right: right.path }
  );
  if (!match) {
    const messages: Record<string, string> = {
      no_face_in_selfie: "No face found in selfie, try again in better light",
      multiple_faces: "Only one person should be in the frame",
      device_detected: "Remove phone/laptop/screen from the camera view",
    };
    const message = reason === "liveness_failed"
      ? livenessMessage || `${failedChallenge || "Liveness"} check failed. Follow the blink, left-turn, and right-turn prompts.`
      : messages[reason] || "Face did not match";
    return { ok: false, status: 403, message };
  }

  return { ok: true, score };
};

const verifyPresence = async (req: AuthRequest): Promise<Presence> => {
  const face = await verifyUploadedFace(req);
  if (!face.ok) return face;

  // Match the selfie first, then validate the live GPS fix as in p4.py.
  const { latitude, longitude, accuracy, wifiSSID, isMockLocation } = req.body;
  if (isMockLocation === "true") {
    return { ok: false, status: 403, message: "Fake/mock location detected" };
  }

  const lat = Number(latitude);
  const lon = Number(longitude);
  const accuracyMeters = Number(accuracy);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(accuracyMeters)) {
    return { ok: false, status: 400, message: "GPS location unavailable. Turn on Location and try again" };
  }
  if (accuracyMeters > campus.maxGpsAccuracyMeters) {
    return {
      ok: false,
      status: 403,
      message: `GPS accuracy is ±${Math.round(accuracyMeters)} m. Move outdoors and try again`,
    };
  }

  const locationOk = isInsideCampus(lat, lon);
  const settings = await getAttendanceSettings();
  const allowedSSIDs = settings.allowedSSIDs.length ? settings.allowedSSIDs : campus.allowedSSIDs;
  const wifiOk = isCampusWifi(wifiSSID, allowedSSIDs);
  if (!locationOk) {
    return { ok: false, status: 403, message: `Please reach ${campus.name} first, then try again.` };
  }
  if (!wifiOk) {
    return {
      ok: false,
      status: 403,
      message: `Please connect to Wi-Fi \"${allowedSSIDs[0]}\" and try again.`,
    };
  }

  return { ok: true, lat, lon, accuracyMeters, campusName: campus.name, wifiSSID, locationOk, wifiOk, score: face.score };
};

export const verifyFaceOnly = async (req: AuthRequest, res: Response) => {
  try {
    const result = await verifyUploadedFace(req);
    if (!result.ok) return res.status(result.status).json({ message: result.message });
    return res.json({ message: "Face recognition verified", faceVerified: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Face verification service failed. Please try again." });
  } finally {
    removeAttendanceFiles(req);
  }
};

export const verifyLocationOnly = async (req: AuthRequest, res: Response) => {
  try {
    const { latitude, longitude, accuracy, wifiSSID, isMockLocation } = req.body;
    if (isMockLocation) return res.status(403).json({ message: "Fake/mock location detected" });
    const lat = Number(latitude);
    const lon = Number(longitude);
    const accuracyMeters = Number(accuracy);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(accuracyMeters)) {
      return res.status(400).json({ message: "GPS location unavailable. Turn on Location and try again" });
    }
    if (accuracyMeters > campus.maxGpsAccuracyMeters) {
      return res.status(403).json({ message: `GPS accuracy is ±${Math.round(accuracyMeters)} m. Move outdoors and try again` });
    }
    if (!isInsideCampus(lat, lon)) {
      return res.status(403).json({ message: `Please reach ${campus.name} first, then try again.` });
    }
    const settings = await getAttendanceSettings();
    const allowedSSIDs = settings.allowedSSIDs.length ? settings.allowedSSIDs : campus.allowedSSIDs;
    if (!isCampusWifi(wifiSSID, allowedSSIDs)) {
      return res.status(403).json({ message: `Please connect to Wi-Fi "${allowedSSIDs[0]}" and try again.` });
    }
    return res.json({
      message: "GPS location and Wi-Fi verified",
      location: { latitude: lat, longitude: lon, accuracyMeters, campusName: campus.name, wifiSSID },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not verify GPS location and Wi-Fi" });
  }
};

export const markAttendance = async (req: AuthRequest, res: Response) => {
  try {
    const date = todayIST();
    const openSession = await Attendance.findOne({
      user: req.user!.id,
      date,
      checkOutAt: null,
    });
    if (openSession) {
      return res.status(409).json({ message: "Check out before starting another attendance session" });
    }

    const p = await verifyPresence(req);
    if (!p.ok) return res.status(p.status).json({ message: p.message });

    const record = await Attendance.create({
      user: req.user!.id,
      date,
      latitude: p.lat,
      longitude: p.lon,
      gpsAccuracyMeters: p.accuracyMeters,
      campusName: p.campusName,
      wifiSSID: p.wifiSSID,
      locationOk: p.locationOk,
      wifiOk: p.wifiOk,
      faceScore: p.score,
    });
    return res.status(201).json({
      message: `Check-in marked at ${p.campusName}`,
      attendance: record.toObject(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Something went wrong" });
  } finally {
    removeAttendanceFiles(req);
  }
};

export const checkOut = async (req: AuthRequest, res: Response) => {
  try {
    const record = await Attendance.findOne({
      user: req.user!.id,
      date: todayIST(),
      checkOutAt: null,
    }).sort({ markedAt: -1 });
    if (!record) return res.status(400).json({ message: "No active check-in to check out" });

    const p = await verifyPresence(req);
    if (!p.ok) return res.status(p.status).json({ message: p.message });

    record.checkOutAt = new Date();
    record.checkOutLatitude = p.lat;
    record.checkOutLongitude = p.lon;
    record.checkOutGpsAccuracyMeters = p.accuracyMeters;
    record.checkOutWifiSSID = p.wifiSSID;
    record.checkOutLocationOk = p.locationOk;
    record.checkOutWifiOk = p.wifiOk;
    record.checkOutFaceScore = p.score;
    await record.save();

    return res.json({
      message: `Check-out marked at ${p.campusName}`,
      attendance: record.toObject(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Something went wrong" });
  } finally {
    removeAttendanceFiles(req);
  }
};

export const todayAttendance = async (_req: AuthRequest, res: Response) => {
  const records = await Attendance.find({ date: todayIST() })
    .populate("user", "name empId")
    .sort({ markedAt: -1 });
  res.json(records);
};

export const myTodayAttendance = async (req: AuthRequest, res: Response) => {
  try {
    const record = await Attendance.findOne({ user: req.user!.id, date: todayIST() })
      .sort({ markedAt: -1 })
      .lean();
    return res.json(record);
  } catch {
    return res.status(500).json({ message: "Could not load today's attendance" });
  }
};

export const myAttendanceHistory = async (req: AuthRequest, res: Response) => {
  try {
    const records = await Attendance.find({ user: req.user!.id }).sort({ date: -1, markedAt: -1 }).lean();
    return res.json(records);
  } catch {
    return res.status(500).json({ message: "Could not load attendance history" });
  }
};
