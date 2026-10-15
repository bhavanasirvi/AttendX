import { Schema, model, Types } from "mongoose";

const attendanceSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: "User", required: true },
    date: { type: String, required: true }, // "2026-10-14"
    markedAt: { type: Date, default: Date.now },
    latitude: Number,
    longitude: Number,
    gpsAccuracyMeters: Number,
    campusName: String,
    wifiSSID: String,
    locationOk: Boolean,
    wifiOk: Boolean,
    faceScore: Number,
    checkOutAt: Date,
    checkOutLatitude: Number,
    checkOutLongitude: Number,
    checkOutGpsAccuracyMeters: Number,
    checkOutWifiSSID: String,
    checkOutLocationOk: Boolean,
    checkOutWifiOk: Boolean,
    checkOutFaceScore: Number,
  },
  { timestamps: true, autoIndex: false }
);

// A staff member may have multiple attendance sessions in one day.
attendanceSchema.index({ user: 1, date: -1, markedAt: -1 });

export default model("Attendance", attendanceSchema);
