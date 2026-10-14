"""Manual API checks. Set consented image/video paths in the environment."""
import os
import sys
from contextlib import ExitStack
from pathlib import Path

import requests

BASE_URL = os.getenv("FACE_SERVICE_URL", "http://127.0.0.1:8000").rstrip("/")
CHALLENGE_PATHS = {name: os.getenv(f"{name.upper()}_CLIP") for name in ("blink", "left", "right")}


def verify(reference: str, selfie: str) -> dict:
    with ExitStack() as stack:
        files = {
            "reference": (Path(reference).name, stack.enter_context(Path(reference).open("rb"))),
            "selfie": (Path(selfie).name, stack.enter_context(Path(selfie).open("rb"))),
        }
        for name, path in CHALLENGE_PATHS.items():
            files[name] = (Path(path).name, stack.enter_context(Path(path).open("rb")))
        response = requests.post(f"{BASE_URL}/verify", files=files, timeout=120)
    response.raise_for_status()
    return response.json()


def main() -> int:
    missing = [name for name, path in CHALLENGE_PATHS.items() if not path]
    if missing:
        print(f"SKIP: set {', '.join(name.upper() + '_CLIP' for name in missing)}")
        return 0

    cases = [
        ("same person", "SAME_REFERENCE", "SAME_SELFIE", True),
        ("different people", "SAME_REFERENCE", "DIFFERENT_SELFIE", False),
        ("no face in selfie", "SAME_REFERENCE", "NO_FACE_IMAGE", False),
    ]
    ok = True
    for label, ref_env, selfie_env, expected in cases:
        reference, selfie = os.getenv(ref_env), os.getenv(selfie_env)
        if not reference or not selfie:
            print(f"SKIP {label}: set {ref_env} and {selfie_env}")
            continue
        result = verify(reference, selfie)
        passed = result.get("match") is expected
        ok &= passed
        print(f"{'PASS' if passed else 'FAIL'} {label}: {result}")

    device_image = os.getenv("DEVICE_SELFIE")
    reference = os.getenv("SAME_REFERENCE")
    if device_image and reference:
        result = verify(reference, device_image)
        passed = result.get("reason") == "device_detected"
        ok &= passed
        print(f"{'PASS' if passed else 'CHECK'} phone/screen photo: {result}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
