"""In-memory YuNet/SFace face matching."""
from __future__ import annotations

import os
import urllib.request
from pathlib import Path

import cv2
import numpy as np

MODEL_DIR = Path(__file__).resolve().parent / "models"
YUNET_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
SFACE_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx"
YUNET_PATH = MODEL_DIR / "face_detection_yunet_2023mar.onnx"
SFACE_PATH = MODEL_DIR / "face_recognition_sface_2021dec.onnx"
MAX_SIDE = 1024


def _ensure_model(path: Path, url: str) -> None:
    if path.is_file() and path.stat().st_size:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "AttendX-face-service"})
        with urllib.request.urlopen(request, timeout=60) as response, path.open("wb") as output:
            output.write(response.read())
    except Exception as exc:
        path.unlink(missing_ok=True)
        print(f"Could not download model. Download it manually from: {url}")
        raise RuntimeError(f"Required model unavailable: {path.name}") from exc


def _decode(data: bytes) -> np.ndarray:
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.size == 0:
        raise ValueError("Invalid image file")
    h, w = image.shape[:2]
    scale = min(1.0, MAX_SIDE / max(h, w))
    if scale < 1.0:
        image = cv2.resize(image, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    return image


class FaceMatcher:
    def __init__(self) -> None:
        _ensure_model(YUNET_PATH, YUNET_URL)
        _ensure_model(SFACE_PATH, SFACE_URL)
        self.detector = cv2.FaceDetectorYN.create(
            str(YUNET_PATH), "", (320, 320), float(os.getenv("FACE_DETECTION_THRESHOLD", "0.9")), 0.3, 5000
        )
        self.recognizer = cv2.FaceRecognizerSF.create(str(SFACE_PATH), "")
        self.threshold = float(os.getenv("MATCH_THRESHOLD", "0.363"))

    def _faces(self, image: np.ndarray) -> np.ndarray:
        h, w = image.shape[:2]
        self.detector.setInputSize((w, h))
        _, faces = self.detector.detect(image)
        return faces if faces is not None else np.empty((0, 15), dtype=np.float32)

    def _find(self, image: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        faces = self._faces(image)
        if len(faces):
            return image, faces
        # Camera orientation metadata is not consistently preserved across phone uploads.
        for angle in (90, 180, 270):
            rotated = cv2.rotate(image, {90: cv2.ROTATE_90_CLOCKWISE, 180: cv2.ROTATE_180,
                                         270: cv2.ROTATE_90_COUNTERCLOCKWISE}[angle])
            faces = self._faces(rotated)
            if len(faces):
                return rotated, faces
        return image, faces

    def verify(self, reference_bytes: bytes, selfie_bytes: bytes) -> dict:
        reference = _decode(reference_bytes)
        selfie = _decode(selfie_bytes)
        ref_image, ref_faces = self._find(reference)
        if len(ref_faces) == 0:
            return {"match": False, "score": 0.0, "reason": "no_face_in_reference"}
        live_image, live_faces = self._find(selfie)
        if len(live_faces) == 0:
            return {"match": False, "score": 0.0, "reason": "no_face_in_selfie"}
        if len(live_faces) != 1:
            return {"match": False, "score": 0.0, "reason": "multiple_faces"}

        ref_face = max(ref_faces, key=lambda f: float(f[2] * f[3]))
        ref_feature = self.recognizer.feature(self.recognizer.alignCrop(ref_image, ref_face))
        live_feature = self.recognizer.feature(self.recognizer.alignCrop(live_image, live_faces[0]))
        score = float(self.recognizer.match(ref_feature, live_feature, cv2.FaceRecognizerSF_FR_COSINE))
        matched = score >= self.threshold
        return {"match": matched, "score": score, "reason": "ok" if matched else "mismatch"}
