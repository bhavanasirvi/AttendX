import mongoose from "mongoose";
import { env } from "./env";
import Attendance from "../models/Attendance";

const ensureAttendanceIndexes = async () => {
  const collection = Attendance.collection;
  await Attendance.createCollection().catch((err: { code?: number }) => {
    if (err.code !== 48) throw err; // NamespaceExists means the collection is already present.
  });
  let indexes = await collection.indexes();
  const legacyUniqueIndex = indexes.find((index) =>
    index.unique && index.key?.user === 1 && index.key?.date === 1
  );

  if (legacyUniqueIndex?.name) {
    await collection.dropIndex(legacyUniqueIndex.name);
    console.log("Removed legacy one-attendance-per-day index");
    indexes = await collection.indexes();
  }

  const hasSessionIndex = indexes.some((index) =>
    !index.unique && index.key?.user === 1 && index.key?.date === -1 && index.key?.markedAt === -1
  );
  if (!hasSessionIndex) {
    await collection.createIndex(
      { user: 1, date: -1, markedAt: -1 },
      { name: "user_1_date_-1_markedAt_-1" }
    );
  }
};

export const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(env.MONGO_URI);
    await ensureAttendanceIndexes();
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  }
};
