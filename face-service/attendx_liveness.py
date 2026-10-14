"""
AttendX - Face Liveness Module (5-second Blink / Head-LEFT / Head-RIGHT challenges)
===================================================================================

Run (camera demo)   :  python attendx_liveness.py
Run (logic self-test):  python attendx_liveness.py --selftest

Keys in the camera window:  SPACE = start | R = retry/restart | D = debug on/off | Q or ESC = quit

HOW LEFT / RIGHT IS DEFINED (important)
---------------------------------------
* All maths runs on the RAW (un-mirrored) camera frame.
* yaw = (nose_x - midpoint_of_cheeks_x) / face_width, using landmarks 1, 234, 454.
* In the raw frame the user's anatomical LEFT side appears on the image's right side.
  So:  yaw > 0  ->  user turned their own LEFT,   yaw < 0  ->  user turned their own RIGHT.
* The preview shown on screen is mirrored (like a mirror), so "LEFT" = your own left,
  which in the mirror also moves toward the screen's left.
* If on your camera the direction feels reversed, set Config.yaw_invert = True.
  The debug overlay (press D) shows the live yaw so you can verify this in 10 seconds.

ANTI-PROXY: DEVICE (SCREEN) DETECTION
-------------------------------------
* A second MediaPipe model (EfficientDet-Lite0, COCO classes) runs on every camera frame and looks for
  electronic screens: cell phone, laptop (also tablets), tv (also PC monitors).
* The moment a device is confirmed in the camera range, the whole verification is STOPPED
  (state DEVICE_BLOCKED) and the screen says: "Remove the device from the camera range".
* When the device has been out of view for Config.device_clear_s seconds, verification
  RESTARTS FROM SCRATCH automatically (new random challenge order) - nothing from before is reused.
* Nothing can pass / verify / mark attendance while a device is visible (also not right before the end).
* The model (efficientdet_lite0.tflite, ~13 MB) auto-downloads once, same as face_landmarker.task.
  Set Config.detect_devices = False to switch this feature off.

LIVENESS vs IDENTITY
--------------------
This file does ONLY face detection + liveness. Identity verification (face recognition against the
enrolled student/staff) is kept separate: pass `identity_check=your_function` to LivenessSession.
It is called once, after all challenges pass. Nothing of your enrollment code is removed.

SECURITY NOTE
-------------
Blink + head-turn are BASIC liveness checks. They stop a simple still photo but are NOT enough
against replay videos, 3D masks or deepfakes. For real security add depth/IR sensors, texture
(anti-spoof) models, challenge randomisation from the server, and server-side verification.
"""

from __future__ import annotations

import os
import random
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Dict, List, Optional, Tuple

import cv2
import numpy as np

# --------------------------------------------------------------------------------------
# CONFIG  (all thresholds in one place - beginner friendly)
# --------------------------------------------------------------------------------------


@dataclass
class Config:
    # ---- camera ----
    camera_index: int = 0            # 0 = default webcam. Try 1 if you have an external camera.
    frame_width: int = 640
    frame_height: int = 480

    # ---- challenge flow ----
    challenge_seconds: float = 5.0   # independent deadline for EVERY challenge
    challenges: Tuple[str, ...] = ("BLINK", "LEFT", "RIGHT")
    randomize_order: bool = True
    success_display_s: float = 1.2   # how long "Challenge passed." stays on screen
    prepare_timeout_s: float = 12.0  # max time to get a stable neutral pose before the attempt fails

    # ---- face tracking policy ----
    stable_face_frames: int = 10     # frames with exactly 1 face before starting
    face_lost_grace_s: float = 1.0   # face may vanish this long during a challenge (timer keeps running)
    low_light_brightness: float = 55 # mean pixel value below this -> low-light warning

    # ---- neutral baseline (taken just before each challenge) ----
    baseline_frames: int = 15        # frames used to measure your "normal" face
    neutral_yaw_max: float = 0.07    # you must look roughly straight (|yaw| below this) for baseline
    min_open_ear: float = 0.17       # EAR below this is not counted as "open eye" for the baseline

    # ---- BLINK ----
    # EAR = Eye Aspect Ratio. ~0.25-0.35 when open, ~0.05-0.15 when closed.
    # We compare against YOUR own open-eye EAR (baseline), so it adapts to every person/camera.
    ear_close_ratio: float = 0.75    # eye counts as CLOSED when EAR < baseline * 0.75
    ear_open_ratio: float = 0.88     # eye counts as OPEN again when EAR > baseline * 0.88
    blink_open_frames_before: int = 3  # eyes must be open this many frames before the blink
    blink_min_closed_frames: int = 2 # closed for at least 2 frames (rejects 1-frame noise)
    blink_min_closed_s: float = 0.05
    blink_max_closed_s: float = 0.60 # longer than this = prolonged closure, NOT a blink

    # ---- HEAD TURN ----
    yaw_threshold: float = 0.12      # how far from neutral (in yaw units). Bigger = harder turn needed.
    yaw_hold_frames: int = 4         # turn must stay beyond the threshold for this many CONSECUTIVE frames
    yaw_invert: bool = False         # flip LEFT/RIGHT if your camera setup is reversed

    # ---- anti-proxy: electronic device / screen detection ----
    detect_devices: bool = True
    # label (COCO name) -> minimum confidence. Lower number = more sensitive (more false alarms).
    # "tv" also catches PC monitors, "laptop"/"cell phone" also catch tablets most of the time.
    device_labels: Dict[str, float] = field(default_factory=lambda: {
        "cell phone": 0.30,
        "laptop": 0.35,
        "tv": 0.35,
    })
    device_min_area_frac: float = 0.01   # ignore boxes smaller than 1% of the frame (tiny/far objects)
    device_detect_every_n: int = 2       # run the device detector on every 2nd frame (saves CPU)
    device_confirm_hits: int = 2         # consecutive detector runs that must see a device before blocking
    device_clear_s: float = 1.5          # device must be gone this long before verification restarts

    # ---- model ----
    device_model_path: str = "efficientdet_lite0.tflite"
    device_model_url: str = (
        "https://storage.googleapis.com/mediapipe-models/object_detector/"
        "efficientdet_lite0/float32/1/efficientdet_lite0.tflite"
    )
    model_path: str = "face_landmarker.task"
    model_url: str = (
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/"
        "face_landmarker/float16/1/face_landmarker.task"
    )


# --------------------------------------------------------------------------------------
# LANDMARK MATHS
# --------------------------------------------------------------------------------------

# MediaPipe Face Landmarker (478 pts) eye landmarks: [outer, up1, up2, inner, low2, low1]
RIGHT_EYE = [33, 160, 158, 133, 153, 144]   # subject's right eye
LEFT_EYE = [362, 385, 387, 263, 373, 380]   # subject's left eye
NOSE_TIP = 1
CHEEK_IMG_LEFT = 234    # left edge of face in the raw image
CHEEK_IMG_RIGHT = 454   # right edge of face in the raw image


def eye_aspect_ratio(pts: np.ndarray) -> float:
    """EAR = (|p2-p6| + |p3-p5|) / (2*|p1-p4|). pts is 6x2 in pixel coordinates."""
    v1 = np.linalg.norm(pts[1] - pts[5])
    v2 = np.linalg.norm(pts[2] - pts[4])
    h = np.linalg.norm(pts[0] - pts[3])
    if h < 1e-6:
        return 0.0
    return float((v1 + v2) / (2.0 * h))


def compute_metrics(landmarks, w: int, h: int) -> Tuple[float, float]:
    """Return (average EAR of both eyes, yaw). yaw>0 = user's own LEFT (see module docstring)."""
    xy = np.array([[lm.x * w, lm.y * h] for lm in landmarks], dtype=np.float64)
    ear = (eye_aspect_ratio(xy[RIGHT_EYE]) + eye_aspect_ratio(xy[LEFT_EYE])) / 2.0
    x_l, x_r = xy[CHEEK_IMG_LEFT][0], xy[CHEEK_IMG_RIGHT][0]
    width = max(x_r - x_l, 1e-6)
    yaw = (xy[NOSE_TIP][0] - (x_l + x_r) / 2.0) / width
    return float(ear), float(yaw)


# --------------------------------------------------------------------------------------
# OBSERVATION (what one camera frame tells us)
# --------------------------------------------------------------------------------------


@dataclass
class Obs:
    num_faces: int = 0
    ear: Optional[float] = None
    yaw: Optional[float] = None
    device_present: bool = False          # a phone / laptop / TV is confirmed in the camera range
    device_label: str = ""
    device_boxes: list = field(default_factory=list)   # [(label, score, x, y, w, h)] in RAW frame pixels

    @property
    def valid(self) -> bool:
        return self.num_faces == 1 and self.ear is not None and self.yaw is not None


# --------------------------------------------------------------------------------------
# DETECTORS (pure logic, no camera needed -> easy to test)
# --------------------------------------------------------------------------------------


class BlinkDetector:
    """Detects: eyes OPEN -> CLOSED (short) -> OPEN again. Prolonged closure is rejected."""

    def __init__(self, cfg: Config, baseline_ear: float):
        self.cfg = cfg
        self.close_thr = baseline_ear * cfg.ear_close_ratio
        self.open_thr = baseline_ear * cfg.ear_open_ratio
        self.state = "WAIT_OPEN"       # WAIT_OPEN -> OPEN -> CLOSED
        self.open_frames = 0
        self.closed_frames = 0
        self.closed_since = 0.0
        self.note = ""

    def update(self, ear: float, t: float) -> bool:
        c = self.cfg
        if self.state in ("WAIT_OPEN", "OPEN"):
            if ear >= self.open_thr:
                self.open_frames += 1
                if self.open_frames >= c.blink_open_frames_before:
                    self.state = "OPEN"
            elif ear <= self.close_thr:
                if self.state == "OPEN":
                    self.state = "CLOSED"
                    self.closed_since = t
                    self.closed_frames = 1
                else:
                    self.open_frames = 0   # closed before we saw open eyes -> not a valid blink start
            return False

        # state == CLOSED
        if ear <= self.close_thr:
            self.closed_frames += 1
            if t - self.closed_since > c.blink_max_closed_s:
                self.note = "Eyes closed too long - blink quickly."
            return False
        if ear >= self.open_thr:
            dur = t - self.closed_since
            if (c.blink_min_closed_s <= dur <= c.blink_max_closed_s
                    and self.closed_frames >= c.blink_min_closed_frames):
                return True
            # invalid (too short / too long): go back and require fresh open eyes
            self.note = "Eyes closed too long - blink quickly." if dur > c.blink_max_closed_s else ""
            self.state = "WAIT_OPEN"
            self.open_frames = 1
            self.closed_frames = 0
        return False


class HeadTurnDetector:
    """Detects a turn of the head relative to the neutral yaw measured just before the challenge."""

    def __init__(self, cfg: Config, direction: str, baseline_yaw: float):
        assert direction in ("LEFT", "RIGHT")
        self.cfg = cfg
        self.direction = direction
        self.baseline = baseline_yaw
        self.sign = 1.0 if direction == "LEFT" else -1.0   # yaw>0 = LEFT
        if cfg.yaw_invert:
            self.sign = -self.sign
        self.streak = 0
        self.note = ""
        self.delta = 0.0

    def update(self, yaw: float) -> bool:
        c = self.cfg
        self.delta = yaw - self.baseline
        progress = self.delta * self.sign      # + = turning the REQUIRED way
        if progress >= c.yaw_threshold:
            self.streak += 1
            self.note = ""
            return self.streak >= c.yaw_hold_frames
        self.streak = 0
        if progress <= -c.yaw_threshold:
            self.note = f"Wrong direction - turn {self.direction}."
        else:
            self.note = ""
        return False


class DeviceMonitor:
    """
    Debounce for device detection (pure logic).
      * BLOCK  : needs `device_confirm_hits` consecutive detector runs that see a device.
      * CLEAR  : needs `device_clear_s` seconds without any detection after the last sighting.
    """

    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.hits = 0
        self.confirmed = False
        self.label = ""
        self.last_hit_t = float("-inf")

    def feed(self, found_label: Optional[str], t: float) -> None:
        """Call once per detector RUN. found_label = best device label seen in that run, or None."""
        if found_label:
            self.hits += 1
            self.last_hit_t = t
            self.label = found_label
            if self.hits >= self.cfg.device_confirm_hits:
                self.confirmed = True
        else:
            self.hits = 0
            if self.confirmed and (t - self.last_hit_t) >= self.cfg.device_clear_s:
                self.confirmed = False
                self.label = ""


# --------------------------------------------------------------------------------------
# STATE MACHINE
# --------------------------------------------------------------------------------------


class State(Enum):
    IDLE = "IDLE"
    FACE_DETECTION = "FACE_DETECTION"
    CHALLENGE_START = "CHALLENGE_START"      # neutral baseline, timer NOT running yet
    CHALLENGE_RUNNING = "CHALLENGE_RUNNING"  # 5-second timer running
    CHALLENGE_SUCCESS = "CHALLENGE_SUCCESS"
    CHALLENGE_FAILED = "CHALLENGE_FAILED"
    FINAL_VERIFICATION = "FINAL_VERIFICATION"  # all passed
    DEVICE_BLOCKED = "DEVICE_BLOCKED"          # phone / laptop / TV seen -> everything paused


DEVICE_MSG = "Device detected! Remove it from the camera range."

INSTRUCTIONS = {
    "BLINK": "Please blink your eyes.",
    "LEFT": "Please turn your head LEFT.",
    "RIGHT": "Please turn your head RIGHT.",
}


class LivenessSession:
    """
    Pure logic. Feed it one Obs + one timestamp (time.monotonic() taken when the frame was captured)
    per frame via update(). Nothing in here touches the camera, so it is easy to test and reuse.

    Policy:
      * Each challenge: 5.0 s deadline measured from the moment the baseline finished (RUNNING start).
      * Only frames captured at or before the deadline can pass a challenge.
      * Detectors are re-created for every challenge -> old frames/results never carry over.
      * Face missing > face_lost_grace_s during a challenge -> FAILED ("Face lost").
      * More than one face during a challenge -> FAILED immediately.
      * Timer is never paused (so tracking loss can't be used to gain extra time).
    """

    def __init__(self, cfg: Config,
                 identity_check: Optional[Callable[[], bool]] = None,
                 on_verified: Optional[Callable[[], None]] = None,
                 on_device_blocked: Optional[Callable[[str], None]] = None):
        self.cfg = cfg
        self.on_device_blocked = on_device_blocked  # optional: e.g. log / alert admin (gets the device label)
        self.device_active = False
        self.device_label = ""
        self.device_block_count = 0
        self.identity_check = identity_check   # optional: return True if face matches enrolled identity
        self.on_verified = on_verified         # optional: e.g. mark attendance via your API
        self.state = State.IDLE
        self.message = "Press SPACE to start verification."
        self.order: List[str] = []
        self.index = 0
        self.results: List[Tuple[str, bool]] = []
        self.identity_ok: Optional[bool] = None
        self._reset_challenge_vars()
        self._stable = 0

    # ---------- public API ----------
    def start(self, t: float) -> None:
        if self.device_active:               # never start / restart while a device is in view
            self.message = DEVICE_MSG
            return
        order = list(self.cfg.challenges)
        if self.cfg.randomize_order:
            random.shuffle(order)
        self.order = order
        self.index = 0
        self.results = []
        self.identity_ok = None
        self._stable = 0
        self._reset_challenge_vars()
        self.state = State.FACE_DETECTION
        self.message = "Looking for your face..."

    retry = start   # a retry is simply a fresh attempt with a new random order

    @property
    def challenge(self) -> Optional[str]:
        return self.order[self.index] if self.order and self.index < len(self.order) else None

    @property
    def progress_text(self) -> str:
        if not self.order:
            return ""
        return f"Challenge {min(self.index + 1, len(self.order))} of {len(self.order)}"

    def remaining(self, t: float) -> float:
        if self.state != State.CHALLENGE_RUNNING:
            return self.cfg.challenge_seconds if self.state == State.CHALLENGE_START else 0.0
        return max(0.0, self.deadline - t)

    @property
    def debug_info(self) -> str:
        d = self.detector
        if isinstance(d, BlinkDetector):
            return f"blink state={d.state} close<{d.close_thr:.3f} open>{d.open_thr:.3f}"
        if isinstance(d, HeadTurnDetector):
            return f"delta_yaw={d.delta:+.3f} need {d.cfg.yaw_threshold:.2f} streak={d.streak}/{d.cfg.yaw_hold_frames}"
        return ""

    # ---------- internals ----------
    def _reset_challenge_vars(self) -> None:
        self.detector = None
        self.deadline = 0.0
        self.run_start = 0.0
        self._prepare_start = 0.0
        self._base_yaw: List[float] = []
        self._base_ear: List[float] = []
        self._lost_since: Optional[float] = None
        self._success_until = 0.0

    def _begin_challenge(self, t: float) -> None:
        self._reset_challenge_vars()          # <- wipes everything from the previous challenge
        self._prepare_start = t
        self.state = State.CHALLENGE_START
        self.message = "Look straight at the camera and keep your eyes open."

    def _fail(self, msg: str) -> None:
        if self.challenge:
            self.results.append((self.challenge, False))
        self.state = State.CHALLENGE_FAILED
        self.message = msg

    # ---------- main per-frame update ----------
    def _enter_block(self, label: str) -> None:
        self.state = State.DEVICE_BLOCKED
        self.device_block_count += 1
        self.message = f"{DEVICE_MSG}  ({label})" if label else DEVICE_MSG
        if self.on_device_blocked:
            try:
                self.on_device_blocked(label)
            except Exception as exc:
                print(f"[AttendX] on_device_blocked error: {exc}")

    def update(self, obs: Obs, t: float) -> None:
        self.device_active = bool(obs.device_present)
        self.device_label = obs.device_label
        s = self.state

        if s == State.FINAL_VERIFICATION:
            return

        # ---- DEVICE CHECK: highest priority, runs in EVERY state ----
        if obs.device_present:
            if s == State.IDLE:
                self.message = f"{DEVICE_MSG}  ({obs.device_label})"
            elif s == State.DEVICE_BLOCKED:
                self.message = f"{DEVICE_MSG}  ({obs.device_label})"
            elif s != State.CHALLENGE_FAILED:
                self._enter_block(obs.device_label)      # stops the running challenge immediately
            return
        if s == State.DEVICE_BLOCKED:                    # device is gone -> start again from scratch
            self.device_active = False
            self.start(t)
            self.message = "Device removed. Restarting verification..."
            return
        if s == State.IDLE:
            self.message = "Press SPACE to start verification."
            return
        if s == State.CHALLENGE_FAILED:
            return

        if s == State.FACE_DETECTION:
            if obs.num_faces > 1:
                self._stable = 0
                self.message = "Only one person should be in front of the camera."
            elif obs.valid:
                self._stable += 1
                self.message = "Face detected. Initializing verification..."
                if self._stable >= self.cfg.stable_face_frames:
                    self._begin_challenge(t)
            else:
                self._stable = 0
                self.message = "No face detected. Please face the camera."
            return

        if s == State.CHALLENGE_START:
            if t - self._prepare_start > self.cfg.prepare_timeout_s:
                self._fail("Could not get a stable face. Please try again.")
                return
            if obs.num_faces > 1:
                self._base_yaw.clear(); self._base_ear.clear()
                self.message = "Only one person should be in front of the camera."
                return
            if not obs.valid:
                self._base_yaw.clear(); self._base_ear.clear()
                self.message = "No face detected. Please face the camera."
                return
            if abs(obs.yaw) > self.cfg.neutral_yaw_max:
                self._base_yaw.clear(); self._base_ear.clear()
                self.message = "Look straight at the camera."
                return
            self.message = f"Get ready: {INSTRUCTIONS[self.challenge]}"
            self._base_yaw.append(obs.yaw)
            if obs.ear >= self.cfg.min_open_ear:
                self._base_ear.append(obs.ear)
            if len(self._base_yaw) >= self.cfg.baseline_frames and len(self._base_ear) >= self.cfg.baseline_frames // 2:
                base_yaw = float(np.median(self._base_yaw))
                base_ear = float(np.median(self._base_ear))
                ch = self.challenge
                self.detector = (BlinkDetector(self.cfg, base_ear) if ch == "BLINK"
                                 else HeadTurnDetector(self.cfg, ch, base_yaw))
                self.run_start = t
                self.deadline = t + self.cfg.challenge_seconds
                self.state = State.CHALLENGE_RUNNING
                self.message = INSTRUCTIONS[ch]
            return

        if s == State.CHALLENGE_RUNNING:
            # Frame captured AFTER the deadline can never pass the challenge.
            if t > self.deadline:
                self._fail("Time expired. Please try again.")
                return
            if obs.num_faces > 1:
                self._fail("Multiple faces detected. Please try again.")
                return
            if not obs.valid:
                if self._lost_since is None:
                    self._lost_since = t
                if t - self._lost_since > self.cfg.face_lost_grace_s:
                    self._fail("Face lost. Please try again.")
                else:
                    self.message = "Face not clear - stay in frame."
                return
            self._lost_since = None
            ch = self.challenge
            if ch == "BLINK":
                done = self.detector.update(obs.ear, t)
            else:
                done = self.detector.update(obs.yaw)
            if done:
                self.results.append((ch, True))
                self.state = State.CHALLENGE_SUCCESS
                self._success_until = t + self.cfg.success_display_s
                self.message = "Challenge passed."
            else:
                self.message = self.detector.note or INSTRUCTIONS[ch]
            return

        if s == State.CHALLENGE_SUCCESS:
            if t >= self._success_until:
                self.index += 1
                if self.index < len(self.order):
                    self._begin_challenge(t)
                else:
                    self._finish()
            return

    def _finish(self) -> None:
        if self.identity_check is not None:
            try:
                self.identity_ok = bool(self.identity_check())
            except Exception as exc:   # never crash the UI because of the identity module
                self.identity_ok = False
                print(f"[AttendX] identity_check error: {exc}")
            if not self.identity_ok:
                self.state = State.CHALLENGE_FAILED
                self.message = "Liveness passed, but identity did not match. Please try again."
                return
        self.state = State.FINAL_VERIFICATION
        self.message = "All liveness checks passed."
        if self.on_verified:
            try:
                self.on_verified()
            except Exception as exc:
                print(f"[AttendX] on_verified error: {exc}")


# --------------------------------------------------------------------------------------
# CAMERA + MEDIAPIPE
# --------------------------------------------------------------------------------------


def _ensure_file(rel_path: str, url: str, size_hint: str) -> str:
    path = rel_path
    if not os.path.isabs(path):
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), path)
    if os.path.exists(path) and os.path.getsize(path) > 1_000_000:
        return path
    name = os.path.basename(path)
    print(f"[AttendX] Downloading {name} (one time, {size_hint})...")
    try:
        urllib.request.urlretrieve(url, path)
    except Exception as exc:
        raise RuntimeError(
            f"Model download failed: {exc}\n"
            f"Manually download:\n  {url}\nand save it next to this script as {name}"
        )
    return path


def ensure_model(cfg: Config) -> str:
    return _ensure_file(cfg.model_path, cfg.model_url, "~4 MB")


def ensure_device_model(cfg: Config) -> str:
    return _ensure_file(cfg.device_model_path, cfg.device_model_url, "~13 MB")


def create_device_detector(cfg: Config):
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision

    options = vision.ObjectDetectorOptions(
        base_options=mp_python.BaseOptions(model_asset_path=ensure_device_model(cfg)),
        running_mode=vision.RunningMode.VIDEO,
        max_results=10,
        score_threshold=min(cfg.device_labels.values()),
        category_allowlist=list(cfg.device_labels.keys()),
    )
    return vision.ObjectDetector.create_from_options(options)


def create_landmarker(model_path: str):
    import mediapipe as mp  # imported here so --selftest works without mediapipe
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision

    options = vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=model_path),
        running_mode=vision.RunningMode.VIDEO,
        num_faces=2,                          # 2 so we can DETECT "multiple faces"
        min_face_detection_confidence=0.5,
        min_face_presence_confidence=0.5,
        min_tracking_confidence=0.5,
        output_face_blendshapes=False,
        output_facial_transformation_matrixes=False,
    )
    return mp, vision.FaceLandmarker.create_from_options(options)


def open_camera(cfg: Config) -> cv2.VideoCapture:
    cap = None
    if sys.platform.startswith("win"):
        cap = cv2.VideoCapture(cfg.camera_index, cv2.CAP_DSHOW)   # faster/more reliable on Windows
    if cap is None or not cap.isOpened():
        cap = cv2.VideoCapture(cfg.camera_index)
    if not cap.isOpened():
        raise RuntimeError(
            "Camera could not be opened.\n"
            " - Close other apps using the camera (Zoom, Teams, browser tabs).\n"
            " - Windows Settings > Privacy & security > Camera > allow desktop apps.\n"
            " - Try Config.camera_index = 1."
        )
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, cfg.frame_width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, cfg.frame_height)
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)    # keep frames fresh -> no stale frames after deadline
    return cap


class FaceAnalyzer:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.mp, self.landmarker = create_landmarker(ensure_model(cfg))
        self._last_ms = -1
        # device (screen) detector
        self.dev = create_device_detector(cfg) if cfg.detect_devices else None
        self.monitor = DeviceMonitor(cfg)
        self._dev_ms = -1
        self._frame_i = 0
        self._last_boxes: list = []

    @staticmethod
    def _next_ts(last: int, t: float) -> int:
        ts = int(t * 1000)
        return last + 1 if ts <= last else ts      # MediaPipe needs strictly increasing timestamps

    def _detect_devices(self, mp_image, t: float, w: int, h: int) -> None:
        self._dev_ms = self._next_ts(self._dev_ms, t)
        res = self.dev.detect_for_video(mp_image, self._dev_ms)
        boxes = []
        for d in res.detections or []:
            if not d.categories:
                continue
            cat = d.categories[0]
            thr = self.cfg.device_labels.get(cat.category_name)
            if thr is None or cat.score < thr:
                continue
            bb = d.bounding_box
            if (bb.width * bb.height) / float(w * h) < self.cfg.device_min_area_frac:
                continue
            boxes.append((cat.category_name, float(cat.score), bb.origin_x, bb.origin_y, bb.width, bb.height))
        self._last_boxes = boxes
        best = max(boxes, key=lambda b: b[1])[0] if boxes else None
        self.monitor.feed(best, t)

    def analyze(self, frame_bgr: np.ndarray, t: float) -> Tuple[Obs, Optional[list]]:
        h, w = frame_bgr.shape[:2]
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        mp_image = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))

        # ---- device detection (every N-th frame) ----
        if self.dev is not None:
            if self._frame_i % max(1, self.cfg.device_detect_every_n) == 0:
                try:
                    self._detect_devices(mp_image, t, w, h)
                except Exception as exc:
                    print(f"[AttendX] device detector error: {exc}")
            self._frame_i += 1

        # ---- face ----
        self._last_ms = self._next_ts(self._last_ms, t)
        res = self.landmarker.detect_for_video(mp_image, self._last_ms)
        faces = res.face_landmarks or []
        lm = None
        if len(faces) == 0:
            obs = Obs(0)
        elif len(faces) > 1:
            obs = Obs(len(faces))
        else:
            try:
                ear, yaw = compute_metrics(faces[0], w, h)
                obs, lm = Obs(1, ear, yaw), faces[0]
            except Exception:
                obs = Obs(1)                  # unreliable landmarks -> treated as "not valid"

        if self.dev is not None:
            obs.device_present = self.monitor.confirmed
            obs.device_label = self.monitor.label
            obs.device_boxes = list(self._last_boxes)
        return obs, lm

    def close(self):
        for obj in (self.landmarker, self.dev):
            try:
                if obj is not None:
                    obj.close()
            except Exception:
                pass


# --------------------------------------------------------------------------------------
# UI (OpenCV window, mirrored preview)
# --------------------------------------------------------------------------------------

GREEN, RED, YELLOW, WHITE, BLUE = (0, 200, 0), (0, 0, 220), (0, 200, 255), (255, 255, 255), (255, 160, 0)
FONT = cv2.FONT_HERSHEY_SIMPLEX


def put(img, text, org, scale=0.7, color=WHITE, thick=2):
    cv2.putText(img, text, org, FONT, scale, (0, 0, 0), thick + 3, cv2.LINE_AA)
    cv2.putText(img, text, org, FONT, scale, color, thick, cv2.LINE_AA)


def draw_ui(frame_raw, lm, obs: Obs, sess: LivenessSession, t: float, debug: bool, low_light: bool):
    img = cv2.flip(frame_raw, 1)          # mirrored preview (like a mirror)
    h, w = img.shape[:2]

    if lm is not None:                    # small dots on eyes + nose so user sees tracking works
        for idx in RIGHT_EYE + LEFT_EYE + [NOSE_TIP]:
            x = int((1 - lm[idx].x) * w); y = int(lm[idx].y * h)
            cv2.circle(img, (x, y), 2, GREEN, -1)

    for (name, score, bx, by, bw, bh) in obs.device_boxes:       # red boxes around detected devices
        x1, x2 = int(w - (bx + bw)), int(w - bx)                  # mirror x like the preview
        cv2.rectangle(img, (x1, int(by)), (x2, int(by + bh)), RED, 2)
        put(img, f"{name} {score:.0%}", (max(x1, 2), max(int(by) - 6, 14)), 0.5, RED, 1)

    bar = img.copy()
    cv2.rectangle(bar, (0, 0), (w, 110), (30, 30, 30), -1)
    cv2.rectangle(bar, (0, h - 40), (w, h), (30, 30, 30), -1)
    img = cv2.addWeighted(bar, 0.65, img, 0.35, 0)

    st = sess.state
    put(img, "AttendX - Liveness Verification", (10, 25), 0.65, BLUE)
    face_txt = ("Face: detected" if obs.valid else
                "Face: MULTIPLE" if obs.num_faces > 1 else "Face: not found")
    put(img, face_txt, (w - 190, 25), 0.55, GREEN if obs.valid else RED, 1)

    color = WHITE
    if st == State.CHALLENGE_SUCCESS: color = GREEN
    elif st == State.CHALLENGE_FAILED: color = RED
    elif st == State.FINAL_VERIFICATION: color = GREEN
    elif st == State.CHALLENGE_RUNNING: color = YELLOW
    elif st == State.DEVICE_BLOCKED: color = RED
    put(img, sess.message, (10, 65), 0.6 if st == State.DEVICE_BLOCKED or sess.device_active else 0.75,
        RED if sess.device_active else color)

    if sess.order and st not in (State.FINAL_VERIFICATION,):
        put(img, sess.progress_text, (10, 98), 0.6, WHITE, 1)

    if st == State.CHALLENGE_RUNNING:
        rem = sess.remaining(t)
        put(img, f"{rem:0.1f}s", (w - 110, 98), 1.0, YELLOW if rem > 1.5 else RED, 2)
        frac = rem / sess.cfg.challenge_seconds
        cv2.rectangle(img, (10, h - 30), (int(10 + (w - 20) * frac), h - 12), YELLOW if frac > 0.3 else RED, -1)
    elif st == State.CHALLENGE_START:
        put(img, "Get ready", (w - 150, 98), 0.7, WHITE, 1)

    if st == State.DEVICE_BLOCKED:
        cv2.rectangle(img, (0, 0), (w - 1, h - 1), RED, 6)
        put(img, "VERIFICATION STOPPED", (w // 2 - 160, h // 2 - 20), 0.9, RED, 2)
        put(img, "Remove the device from the camera range", (w // 2 - 215, h // 2 + 20), 0.65, WHITE, 2)
    elif st == State.CHALLENGE_FAILED:
        put(img, "FAILED  - press R to retry", (w // 2 - 170, h // 2), 0.9, RED, 2)
    elif st == State.CHALLENGE_SUCCESS:
        put(img, "SUCCESS", (w // 2 - 70, h // 2), 1.1, GREEN, 3)
    elif st == State.FINAL_VERIFICATION:
        put(img, "LIVENESS VERIFIED", (w // 2 - 160, h // 2), 1.0, GREEN, 3)
        put(img, "Press R to run again", (w // 2 - 110, h // 2 + 40), 0.6, WHITE, 1)
    elif st == State.IDLE:
        put(img, "Press SPACE to start", (w // 2 - 130, h // 2), 0.9, WHITE, 2)

    if low_light:
        put(img, "Low light - please move to a brighter place", (10, h - 50), 0.55, YELLOW, 1)
    foot = "SPACE start | R retry | D debug | Q quit"
    if debug:
        y = f"yaw={obs.yaw:+.3f}" if obs.yaw is not None else "yaw=--"
        e = f"EAR={obs.ear:.3f}" if obs.ear is not None else "EAR=--"
        foot = f"{e}  {y}  {sess.debug_info}"
    put(img, foot, (10, h - 12), 0.45, WHITE, 1)
    return img


def run_app(cfg: Config) -> int:
    try:
        analyzer = FaceAnalyzer(cfg)
        cap = open_camera(cfg)         # single camera init for the whole session
    except Exception as exc:
        print(f"[AttendX] ERROR: {exc}")
        return 1

    sess = LivenessSession(cfg)
    win = "AttendX Liveness"
    cv2.namedWindow(win, cv2.WINDOW_AUTOSIZE)
    debug, fail_reads = True, 0
    try:
        while True:
            ok, frame = cap.read()
            t = time.monotonic()               # capture timestamp - used for ALL deadline checks
            if not ok or frame is None:
                fail_reads += 1
                if fail_reads > 30:
                    print("[AttendX] Camera stopped returning frames.")
                    break
                continue
            fail_reads = 0

            obs, lm = analyzer.analyze(frame, t)
            low_light = float(frame.mean()) < cfg.low_light_brightness
            sess.update(obs, t)
            cv2.imshow(win, draw_ui(frame, lm, obs, sess, t, debug, low_light))

            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
            if key == ord(" ") and sess.state == State.IDLE:
                sess.start(time.monotonic())
            elif key in (ord("r"), ord("R")) and sess.state in (State.CHALLENGE_FAILED, State.FINAL_VERIFICATION, State.IDLE):
                sess.retry(time.monotonic())
            elif key in (ord("d"), ord("D")):
                debug = not debug
            if cv2.getWindowProperty(win, cv2.WND_PROP_VISIBLE) < 1:
                break
    finally:
        cap.release()
        analyzer.close()
        cv2.destroyAllWindows()
    return 0


# --------------------------------------------------------------------------------------
# SELF-TEST (no camera needed) - tests the logic with simulated frames at 30 FPS
# --------------------------------------------------------------------------------------


def _simulate(cfg: Config, scenario, max_s: float = 20.0, fps: int = 30) -> LivenessSession:
    """scenario(t_rel) -> (ear, yaw), t_rel = seconds since the 5-second window opened."""
    sess = LivenessSession(cfg)
    sess.start(0.0)
    dt, t = 1.0 / fps, 0.0
    while t < max_s:
        if sess.state == State.CHALLENGE_RUNNING:
            ear, yaw = scenario(t - sess.run_start)
        else:
            ear, yaw = 0.30, 0.0
        sess.update(Obs(1, ear, yaw), t)
        if sess.state in (State.CHALLENGE_FAILED, State.FINAL_VERIFICATION):
            break
        t += dt
    return sess


def selftest() -> int:
    base = dict(randomize_order=False)
    ok_all = True

    def check(name, cond):
        nonlocal ok_all
        print(f"  [{'PASS' if cond else 'FAIL'}] {name}")
        ok_all &= bool(cond)

    print("AttendX logic self-test")
    c = Config(challenges=("BLINK",), **base)
    s = _simulate(c, lambda r: (0.08 if 1.0 <= r <= 1.15 else 0.30, 0.0))
    check("valid blink at 1.0s passes", s.state == State.FINAL_VERIFICATION)
    s = _simulate(c, lambda r: (0.30, 0.0))
    check("no blink -> FAILED (timeout)", s.state == State.CHALLENGE_FAILED and "expired" in s.message)
    s = _simulate(c, lambda r: (0.08 if r >= 1.0 else 0.30, 0.0))
    check("eyes closed for rest of window -> FAILED", s.state == State.CHALLENGE_FAILED)
    s = _simulate(c, lambda r: (0.08 if 1.0 <= r <= 2.5 else 0.30, 0.0))
    check("prolonged closure (1.5s) is NOT a blink", s.state == State.CHALLENGE_FAILED)
    s = _simulate(c, lambda r: (0.08 if 5.2 <= r <= 5.3 else 0.30, 0.0))
    check("blink AFTER 5s deadline -> FAILED", s.state == State.CHALLENGE_FAILED)
    s = _simulate(c, lambda r: (0.08 if abs(r - 1.0) < 0.01 else 0.30, 0.0))
    check("single-frame noise is NOT a blink", s.state == State.CHALLENGE_FAILED)

    c = Config(challenges=("LEFT",), **base)
    s = _simulate(c, lambda r: (0.30, 0.20 if r >= 1.0 else 0.0))
    check("turn LEFT (yaw +) passes LEFT", s.state == State.FINAL_VERIFICATION)
    s = _simulate(c, lambda r: (0.30, -0.20 if r >= 1.0 else 0.0))
    check("turn RIGHT does NOT pass LEFT", s.state == State.CHALLENGE_FAILED)
    s = _simulate(c, lambda r: (0.30, 0.20 if abs(r - 1.0) < 0.02 else 0.0))
    check("1-2 noisy frames do NOT pass LEFT", s.state == State.CHALLENGE_FAILED)
    s = _simulate(c, lambda r: (0.30, 0.20 if r >= 5.3 else 0.0))
    check("LEFT turn after deadline -> FAILED", s.state == State.CHALLENGE_FAILED)

    c = Config(challenges=("RIGHT",), **base)
    s = _simulate(c, lambda r: (0.30, -0.20 if r >= 1.0 else 0.0))
    check("turn RIGHT (yaw -) passes RIGHT", s.state == State.FINAL_VERIFICATION)
    s = _simulate(c, lambda r: (0.30, 0.20 if r >= 1.0 else 0.0))
    check("turn LEFT does NOT pass RIGHT", s.state == State.CHALLENGE_FAILED)

    c = Config(challenges=("BLINK", "LEFT", "RIGHT"), **base)
    def full(r, _c=[None]):
        return (0.30, 0.0)
    sess = LivenessSession(c); sess.start(0.0)
    t, dt = 0.0, 1 / 30
    while t < 60 and sess.state not in (State.CHALLENGE_FAILED, State.FINAL_VERIFICATION):
        ch, rr = sess.challenge, t - sess.run_start
        ear, yaw = 0.30, 0.0
        if sess.state == State.CHALLENGE_RUNNING:
            if ch == "BLINK" and 1.0 <= rr <= 1.12: ear = 0.08
            if ch == "LEFT" and rr >= 1.0: yaw = 0.2
            if ch == "RIGHT" and rr >= 1.0: yaw = -0.2
        sess.update(Obs(1, ear, yaw), t); t += dt
    check("full BLINK->LEFT->RIGHT sequence verified", sess.state == State.FINAL_VERIFICATION
          and [r for _, r in sess.results] == [True, True, True])

    # tracking-loss policies
    c = Config(challenges=("LEFT",), **base)
    sess = LivenessSession(c); sess.start(0.0); t = 0.0
    while sess.state != State.CHALLENGE_RUNNING: sess.update(Obs(1, 0.3, 0.0), t); t += 1 / 30
    for _ in range(45): sess.update(Obs(0), t); t += 1 / 30       # 1.5s without face
    check("face lost > 1s -> FAILED", sess.state == State.CHALLENGE_FAILED and "lost" in sess.message)
    sess.retry(t)
    check("retry restarts the flow", sess.state == State.FACE_DETECTION)
    while sess.state != State.CHALLENGE_RUNNING: sess.update(Obs(1, 0.3, 0.0), t); t += 1 / 30
    sess.update(Obs(2), t)
    check("second face during challenge -> FAILED", sess.state == State.CHALLENGE_FAILED)

    # ---- device (phone / laptop / TV) detection ----
    print("Device detection")
    c = Config(challenges=("BLINK", "LEFT"), **base)

    mon = DeviceMonitor(c)
    mon.feed("cell phone", 0.0)
    check("1 sighting alone does not block (debounce)", not mon.confirmed)
    mon.feed("cell phone", 0.1)
    check("2 consecutive sightings block", mon.confirmed and mon.label == "cell phone")
    mon.feed(None, 0.5)
    check("device just left -> still blocked (clear delay)", mon.confirmed)
    mon.feed(None, 0.1 + c.device_clear_s + 0.01)
    check("device gone for device_clear_s -> unblocked", not mon.confirmed)

    def run(sess, t, n, **kw):
        for _ in range(n):
            sess.update(Obs(1, kw.get("ear", 0.30), kw.get("yaw", 0.0),
                            device_present=kw.get("dev", False), device_label=kw.get("label", "")), t)
            t += 1 / 30
        return t

    sess = LivenessSession(c); sess.start(0.0); t = 0.0
    while sess.state != State.CHALLENGE_RUNNING: t = run(sess, t, 1)
    done_before = list(sess.results)
    t = run(sess, t, 3, dev=True, label="cell phone")
    check("phone appears mid-challenge -> DEVICE_BLOCKED", sess.state == State.DEVICE_BLOCKED)
    check("block message tells user to remove the device", "Remove" in sess.message)
    t = run(sess, t, 120, dev=True, label="cell phone", ear=0.08)     # even blinking can't pass now
    check("nothing passes while device is visible", sess.state == State.DEVICE_BLOCKED and sess.results == done_before)
    t = run(sess, t, 1)
    check("device removed -> verification restarts from scratch",
          sess.state == State.FACE_DETECTION and sess.results == [])
    while sess.state not in (State.CHALLENGE_FAILED, State.FINAL_VERIFICATION) and t < 200:
        ch, rr = sess.challenge, t - sess.run_start
        ear, yaw = 0.30, 0.0
        if sess.state == State.CHALLENGE_RUNNING:
            if ch == "BLINK" and 1.0 <= rr <= 1.12: ear = 0.08
            if ch == "LEFT" and rr >= 1.0: yaw = 0.2
        t = run(sess, t, 1, ear=ear, yaw=yaw)
    check("after removal the full flow can complete", sess.state == State.FINAL_VERIFICATION)

    sess = LivenessSession(c)
    run(sess, 0.0, 5, dev=True, label="laptop")
    sess.start(1.0)
    check("cannot start while a device is visible", sess.state == State.IDLE)
    run(sess, 1.0, 2)
    sess.start(2.0)
    check("can start once device is gone", sess.state == State.FACE_DETECTION)

    sess = LivenessSession(c); sess.start(0.0); t = 0.0
    while sess.state != State.CHALLENGE_SUCCESS:
        ch, rr = sess.challenge, t - sess.run_start
        ear = 0.08 if (sess.state == State.CHALLENGE_RUNNING and ch == "BLINK" and 1.0 <= rr <= 1.12) else 0.30
        yaw = 0.2 if (sess.state == State.CHALLENGE_RUNNING and ch == "LEFT" and rr >= 1.0) else 0.0
        t = run(sess, t, 1, ear=ear, yaw=yaw)
    t = run(sess, t, 1, dev=True, label="tv")
    check("device during 'Challenge passed' screen -> blocked, not verified", sess.state == State.DEVICE_BLOCKED)

    print("\nALL TESTS PASSED" if ok_all else "\nSOME TESTS FAILED")
    return 0 if ok_all else 1


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(selftest())
    sys.exit(run_app(Config()))
