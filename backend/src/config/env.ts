import dotenv from "dotenv";
dotenv.config();

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env variable: ${key}`);
  return value;
};

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
const faceMock = process.env.FACE_MOCK === "true";
const faceServiceUrl = process.env.FACE_SERVICE_URL;

if (!mongoUri) throw new Error("Missing env variable: MONGO_URI or MONGODB_URI");
if (!faceMock && !faceServiceUrl) throw new Error("Missing env variable: FACE_SERVICE_URL");

export const env = {
  PORT: Number(process.env.PORT) || 5000,
  MONGO_URI: mongoUri,
  JWT_SECRET: required("JWT_SECRET"),
  FACE_SERVICE_URL: faceServiceUrl || "",
  FACE_MOCK: faceMock,
};
