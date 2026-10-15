import { Response } from "express";
import fs from "fs";
import bcrypt from "bcryptjs";
import User from "../models/User";
import { AuthRequest } from "../middlewares/auth";

const discardUploadedFace = (req: AuthRequest) => {
  if (req.file) fs.unlink(req.file.path, () => {});
};

export const createStaff = async (req: AuthRequest, res: Response) => {
  try {
    const name = String(req.body.name || "").trim();
    const empId = String(req.body.empId || "").trim();
    const password = String(req.body.password || "");
    if (!name || !empId || !password) {
      discardUploadedFace(req);
      return res.status(400).json({ message: "Name, employee ID and password are required" });
    }
    if (password.length < 6) {
      discardUploadedFace(req);
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    if (await User.findOne({ empId })) {
      discardUploadedFace(req);
      return res.status(409).json({ message: "empId already exists" });
    }
    const user = await User.create({
      name,
      empId,
      password: await bcrypt.hash(password, 10),
      role: "staff",
      ...(req.file ? { faceImagePath: req.file.path } : {}),
    });
    return res.status(201).json({ id: user._id, name: user.name, empId: user.empId });
  } catch (err) {
    discardUploadedFace(req);
    return res.status(500).json({ message: "Could not create employee" });
  }
};

export const listStaff = async (_req: AuthRequest, res: Response) => {
  try {
    const staff = await User.find({ role: "staff" }).select("name empId faceImagePath createdAt").sort({ createdAt: -1 });
    return res.json(staff.map((user) => ({
      id: user._id,
      name: user.name,
      empId: user.empId,
      hasFace: !!user.faceImagePath,
      createdAt: user.createdAt,
    })));
  } catch {
    return res.status(500).json({ message: "Could not load employees" });
  }
};

export const updateStaff = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const name = String(req.body.name || "").trim();
    const empId = String(req.body.empId || "").trim();
    const password = String(req.body.password || "");
    if (!name || !empId) {
      discardUploadedFace(req);
      return res.status(400).json({ message: "Name and employee ID are required" });
    }
    if (password && password.length < 6) {
      discardUploadedFace(req);
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    const user = await User.findOne({ _id: id, role: "staff" });
    if (!user) {
      discardUploadedFace(req);
      return res.status(404).json({ message: "Employee not found" });
    }
    const duplicate = await User.findOne({ empId, _id: { $ne: user._id } });
    if (duplicate) {
      discardUploadedFace(req);
      return res.status(409).json({ message: "Employee ID already exists" });
    }

    const oldFaceImagePath = user.faceImagePath;
    user.name = name;
    user.empId = empId;
    if (password) user.password = await bcrypt.hash(password, 10);
    if (req.file) user.faceImagePath = req.file.path;
    await user.save();
    if (req.file && oldFaceImagePath) fs.unlink(oldFaceImagePath, () => {});
    return res.json({ id: user._id, name: user.name, empId: user.empId, hasFace: !!user.faceImagePath });
  } catch (err) {
    discardUploadedFace(req);
    return res.status(500).json({ message: "Could not update employee" });
  }
};

export const deleteStaff = async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findOneAndDelete({ _id: req.params.id, role: "staff" });
    if (!user) return res.status(404).json({ message: "Employee not found" });
    if (user.faceImagePath) fs.unlink(user.faceImagePath, () => {});
    return res.json({ message: "Employee deleted" });
  } catch {
    return res.status(500).json({ message: "Could not delete employee" });
  }
};
