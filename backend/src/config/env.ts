import dotenv from "dotenv";
dotenv.config();

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env variable: ${key}`);
  return value;
};

export const env = {
  PORT: Number(process.env.PORT) || 5000,
  MONGO_URI: required("MONGO_URI"),
  JWT_SECRET: required("JWT_SECRET"),
  FACE_SERVICE_URL: required("FACE_SERVICE_URL"),
};