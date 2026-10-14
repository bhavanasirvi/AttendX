import { Response } from "express";
import bcrypt from "bcryptjs";
import User from "../models/User";
import { AuthRequest } from "../middlewares/auth";

export const createStaff = async (req: AuthRequest, res: Response) => {
  try {
    const { name, empId, password } = req.body;
    if (!name || !empId || !password || !req.file) {
      return res.status(400).json({ message: "name, empId, password and face image required" });
    }
    if (await User.findOne({ empId })) {
      return res.status(409).json({ message: "empId already exists" });
    }
    const user = await User.create({
      name,
      empId,
      password: await bcrypt.hash(password, 10),
      role: "staff",
      faceImagePath: req.file.path,
    });
    res.status(201).json({ id: user._id, name: user.name, empId: user.empId });
  } catch (err) {
    res.status(500).json({ message: "Could not create staff" });
  }
};

export const listStaff = async (_req: AuthRequest, res: Response) => {
  const staff = await User.find({ role: "staff" }).select("name empId createdAt");
  res.json(staff);
};