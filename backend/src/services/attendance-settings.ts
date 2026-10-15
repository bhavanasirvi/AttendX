import { campus } from "../config/campus";
import AppSettings from "../models/AppSettings";

export const getAttendanceSettings = () =>
  AppSettings.findOneAndUpdate(
    { key: "attendance" },
    { $setOnInsert: { allowedSSIDs: campus.allowedSSIDs } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
