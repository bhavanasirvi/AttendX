import { Schema, model, Types } from "mongoose";

const attendanceSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true }, // "2026-10-14"
    markedAt: { type: Date, default: Date.now },
    latitude: Number,
    longitude: Number,
    wifiSSID: String,
    locationOk: Boolean,
    wifiOk: Boolean,
    faceScore: Number,
  },
  { timestamps: true }
);

// ek staff, ek din, ek hi attendance
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

export default model("Attendance", attendanceSchema);