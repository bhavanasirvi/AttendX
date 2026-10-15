import multer from "multer";

const imageFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  if (file.mimetype.startsWith("image/")) cb(null, true);
  else cb(new Error("Only images allowed"));
};

const attendanceFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const isSelfie = file.fieldname === "selfie" && file.mimetype.startsWith("image/");
  const isChallengeClip = ["blink", "left", "right"].includes(file.fieldname) && file.mimetype.startsWith("video/");
  if (isSelfie || isChallengeClip) cb(null, true);
  else cb(new Error("Attendance requires a selfie and blink/left/right video clips"));
};

export const uploadFace = multer({ dest: "uploads/faces/", fileFilter: imageFilter });
export const uploadSelfie = multer({ dest: "uploads/selfies/", fileFilter: imageFilter });
export const uploadAttendance = multer({
  dest: "uploads/selfies/",
  fileFilter: attendanceFilter,
  limits: { files: 4, fileSize: 20 * 1024 * 1024 },
}).fields([
  { name: "selfie", maxCount: 1 },
  { name: "blink", maxCount: 1 },
  { name: "left", maxCount: 1 },
  { name: "right", maxCount: 1 },
]);

export const uploadBrandLogo = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) cb(null, true);
    else cb(new Error("Logo must be a PNG, JPG, or WebP image"));
  },
  limits: { files: 1, fileSize: 5 * 1024 * 1024 },
}).single("logo");
