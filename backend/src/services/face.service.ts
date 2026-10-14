import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import { env } from "../config/env";

export const verifyFace = async (
  referencePath: string,
  selfiePath: string
): Promise<{ match: boolean; score: number }> => {
  if (env.FACE_MOCK) return { match: true, score: 0.99 };

  const form = new FormData();
  form.append("reference", fs.createReadStream(referencePath));
  form.append("selfie", fs.createReadStream(selfiePath));

  const { data } = await axios.post(`${env.FACE_SERVICE_URL}/verify`, form, {
    headers: form.getHeaders(),
    timeout: 20000,
  });
  return { match: data.match, score: data.score };
};