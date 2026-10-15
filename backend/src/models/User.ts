import { Schema, model } from "mongoose";

export interface IUser {
  name: string;
  empId: string;
  password: string;
  role: "admin" | "staff";
  faceImagePath?: string; // enrolled face ki photo ka path
  createdAt?: Date;
  updatedAt?: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    empId: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["admin", "staff"], default: "staff" },
    faceImagePath: { type: String },
  },
  { timestamps: true }
);

export default model<IUser>("User", userSchema);
