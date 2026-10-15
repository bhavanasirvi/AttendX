import { Schema, model } from "mongoose";

const appSettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "attendance" },
    allowedSSIDs: { type: [String], required: true, default: [] },
  },
  { timestamps: true }
);

export default model("AppSettings", appSettingsSchema);
