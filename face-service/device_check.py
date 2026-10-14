"""IMAGE-mode MediaPipe check for visible phones, laptops, and televisions."""
from __future__ import annotations

import cv2
import mediapipe as mp
import numpy as np
from attendx_liveness import Config, ensure_device_model
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision


class DeviceChecker:
    def __init__(self) -> None:
        self.config = Config(device_model_path="models/efficientdet_lite0.tflite")
        options = vision.ObjectDetectorOptions(
            base_options=mp_python.BaseOptions(model_asset_path=ensure_device_model(self.config)),
            running_mode=vision.RunningMode.IMAGE,
            max_results=20,
            score_threshold=min(self.config.device_labels.values()),
            category_allowlist=list(self.config.device_labels.keys()),
        )
        self.detector = mp.tasks.vision.ObjectDetector.create_from_options(options)

    def close(self) -> None:
        self.detector.close()

    def detect(self, image_bytes: bytes) -> bool:
        bgr = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
        if bgr is None:
            return False
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        decoded = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = self.detector.detect(decoded)
        height, width = decoded.height, decoded.width
        for detection in result.detections:
            category = detection.categories[0] if detection.categories else None
            if category is None or category.category_name not in self.config.device_labels:
                continue
            if category.score < self.config.device_labels[category.category_name]:
                continue
            box = detection.bounding_box
            if (box.width * box.height) / (width * height) >= self.config.device_min_area_frac:
                return True
        return False
