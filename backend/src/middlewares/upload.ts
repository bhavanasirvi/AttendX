import multer from "multer";

const imageFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (file.mimetype.startsWith("image/")) cb(null, true);
  else cb(new Error("Only images allowed"));
};

export const uploadFace = multer({ dest: "uploads/faces/", fileFilter: imageFilter });
export const uploadSelfie = multer({ dest: "uploads/selfies/", fileFilter: imageFilter });