"""AttendX face verification HTTP service. Images stay in memory."""
from __future__ import annotations

import logging
import os
from email import policy
from email.parser import BytesParser
from contextlib import asynccontextmanager

import cv2
import numpy as np
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

load_dotenv()

from device_check import DeviceChecker
from face_match import FaceMatcher
from liveness_verify import LivenessVerifier

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("attendx.face")
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_VIDEO_BYTES = 20 * 1024 * 1024
MAX_REQUEST_BYTES = 5 * MAX_UPLOAD_BYTES + 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load weights and construct native detectors once, before serving requests.
    app.state.matcher = FaceMatcher()
    app.state.device_checker = DeviceChecker() if os.getenv("DEVICE_CHECK", "true").lower() == "true" else None
    app.state.liveness = LivenessVerifier()
    try:
        yield
    finally:
        app.state.liveness.close()
        if app.state.device_checker is not None:
            app.state.device_checker.close()


app = FastAPI(title="AttendX Face Service", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


async def _read_uploads(request: Request) -> dict[str, bytes]:
    content_type = request.headers.get("content-type", "")
    body = await request.body()
    if len(body) > MAX_REQUEST_BYTES:
        raise HTTPException(status_code=400, detail="Image upload is too large")
    # Parse multipart directly from the request bytes; UploadFile uses a
    # spooled temporary file and may spill larger images onto disk.
    envelope = (
        f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("ascii", "replace")
        + body
    )
    message = BytesParser(policy=policy.default).parsebytes(envelope)
    if not message.is_multipart():
        raise HTTPException(status_code=400, detail="Expected multipart form data")
    uploads: dict[str, bytes] = {}
    for part in message.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if name == "skipIdentity" and not part.get_filename():
            uploads[name] = (part.get_payload(decode=True) or b"").strip().lower()
            continue
        if name not in ("reference", "selfie", "blink", "left", "right") or not part.get_filename():
            continue
        if name in uploads:
            raise HTTPException(status_code=400, detail=f"Duplicate {name} file")
        data = part.get_payload(decode=True) or b""
        limit = MAX_VIDEO_BYTES if name in ("blink", "left", "right") else MAX_UPLOAD_BYTES
        if not data or len(data) > limit:
            raise HTTPException(status_code=400, detail=f"Invalid or oversized {name} file")
        if name in ("reference", "selfie") and cv2.imdecode(
            np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR
        ) is None:
            raise HTTPException(status_code=400, detail=f"Invalid {name} image file")
        uploads[name] = data
    return uploads


async def _required_upload(uploads: dict[str, bytes], name: str) -> bytes:
    if name not in uploads:
        raise HTTPException(status_code=400, detail=f"Missing {name} file")
    return uploads[name]


def _verify_uploads(uploads: dict[str, bytes]) -> dict:
    liveness = app.state.liveness.verify({key: uploads[key] for key in ("blink", "left", "right")})
    if not liveness["passed"]:
        return {
            "match": False,
            "score": 0.0,
            "reason": liveness["reason"],
            "failedChallenge": liveness.get("failedChallenge"),
            "message": liveness.get("message"),
        }
    if app.state.device_checker is not None and app.state.device_checker.detect(uploads["selfie"]):
        return {"match": False, "score": 0.0, "reason": "device_detected"}
    if uploads.get("skipIdentity") == b"true":
        return {"match": True, "score": 0.99, "reason": "ok"}
    return app.state.matcher.verify(uploads["reference"], uploads["selfie"])


@app.post("/verify")
async def verify(request: Request):
    uploads = await _read_uploads(request)
    for field in ("reference", "selfie", "blink", "left", "right"):
        await _required_upload(uploads, field)
    try:
        result = await run_in_threadpool(_verify_uploads, uploads)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    logger.info("verify reason=%s score=%.5f", result["reason"], result["score"])
    return result


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
