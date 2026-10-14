import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User";
import { env } from "../config/env";

export const login = async (req: Request, res: Response) => {
  const { empId, password } = req.body;

  const user = await User.findOne({ empId });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign({ id: user._id, role: user.role }, env.JWT_SECRET, {
    expiresIn: "7d",
  });

  res.json({
    token,
    user: { id: user._id, name: user.name, empId: user.empId, role: user.role },
  });
};