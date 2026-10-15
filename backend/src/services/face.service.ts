import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import { env } from "../config/env";

export const verifyFace = async (
  referencePath: string,
  selfiePath: string,
  clips: { blink: string; left: string; right: string }
): Promise<{
  match: boolean;
  score: number;
  reason: string;
  message?: string;
  failedChallenge?: string;
}> => {

  const form = new FormData();
  form.append("reference", fs.createReadStream(referencePath));
  form.append("selfie", fs.createReadStream(selfiePath));
  form.append("blink", fs.createReadStream(clips.blink));
  form.append("left", fs.createReadStream(clips.left));
  form.append("right", fs.createReadStream(clips.right));
  form.append("skipIdentity", String(env.FACE_MOCK));

  const { data } = await axios.post(`${env.FACE_SERVICE_URL}/verify`, form, {
    headers: form.getHeaders(),
    timeout: 90000,
  });
  return {
    match: data.match,
    score: data.score,
    reason: data.reason,
    message: data.message,
    failedChallenge: data.failedChallenge,
  };
};
