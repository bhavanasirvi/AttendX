"""Run the attached liveness state machine against three short in-memory clips."""
from __future__ import annotations

import io
import os
import threading
import time
from dataclasses import replace

import av

from attendx_liveness import Config, DeviceMonitor, FaceAnalyzer, LivenessSession, State

CHALLENGES = ("BLINK", "LEFT", "RIGHT")


class LivenessVerifier:
    def __init__(self) -> None:
        self.config = Config(
            challenges=CHALLENGES,
            randomize_order=False,
            challenge_seconds=5.0,
            detect_devices=os.getenv("DEVICE_CHECK", "true").lower() == "true",
            model_path="models/face_landmarker.task",
            device_model_path="models/efficientdet_lite0.tflite",
        )
        self.analyzer = FaceAnalyzer(self.config)
        self.lock = threading.Lock()

    def close(self) -> None:
        self.analyzer.close()

    def verify(self, clips: dict[str, bytes]) -> dict:
        fields = {"BLINK": "blink", "LEFT": "left", "RIGHT": "right"}
        with self.lock:
            # Debounce device detections per attendance attempt while reusing the
            # already loaded MediaPipe models and monotonically increasing clocks.
            self.analyzer.monitor = DeviceMonitor(self.config)
            self.analyzer._frame_i = 0
            self.analyzer._last_boxes = []

            for challenge in CHALLENGES:
                data = clips.get(fields[challenge])
                if not data:
                    return {"passed": False, "reason": "liveness_failed", "failedChallenge": challenge}

                now = time.monotonic()
                session_config = replace(self.config, challenges=(challenge,))
                session = LivenessSession(session_config)
                session.start(now)
                try:
                    with av.open(io.BytesIO(data), mode="r") as container:
                        stream = next((s for s in container.streams if s.type == "video"), None)
                        if stream is None:
                            return {"passed": False, "reason": "liveness_failed", "failedChallenge": challenge}
                        for frame in container.decode(video=stream.index):
                            frame_time = frame.time
                            if frame_time is None:
                                frame_time = float(frame.pts or 0) * float(stream.time_base)
                            timestamp = now + max(0.0, frame_time)
                            obs, _ = self.analyzer.analyze(frame.to_ndarray(format="bgr24"), timestamp)
                            session.update(obs, timestamp)

                            if session.state == State.DEVICE_BLOCKED:
                                return {"passed": False, "reason": "device_detected", "failedChallenge": challenge}
                            if session.state == State.CHALLENGE_FAILED:
                                break
                            if (challenge, True) in session.results:
                                break
                except Exception:
                    return {"passed": False, "reason": "liveness_failed", "failedChallenge": challenge}

                if (challenge, True) not in session.results:
                    return {
                        "passed": False,
                        "reason": "liveness_failed",
                        "failedChallenge": challenge,
                        "message": session.message,
                    }

            return {"passed": True, "reason": "ok"}
