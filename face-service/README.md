# AttendX face service

FastAPI service for in-memory face comparison and MediaPipe liveness checks. Each attendance attempt must include three short video clips: blink, head-left, and head-right. The service logs only the result reason and numeric score.

## Windows PowerShell setup

From the repository root:

```powershell
cd face-service
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn main:app --host 0.0.0.0 --port 8000
```

Python 3.10–3.12 is supported. On first startup, the YuNet, SFace, FaceLandmarker, and (when enabled) EfficientDet-Lite0 weights download into `models\`. If a download fails, startup prints the manual model URL. `models\` and the virtual environment should not be committed.

Set `DEVICE_CHECK=false` to disable the screen/device check. `MATCH_THRESHOLD` defaults to `0.363`; `PORT` defaults to `8000` for `python main.py`. The command above uses port 8000 directly.

## API

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
curl.exe -X POST http://127.0.0.1:8000/verify `
  -F "reference=@C:\images\enrolled.jpg" `
  -F "selfie=@C:\images\selfie.jpg" `
  -F "blink=@C:\images\blink.mp4" `
  -F "left=@C:\images\left.mp4" `
  -F "right=@C:\images\right.mp4"
```

`/verify` requires `reference`, `selfie`, `blink`, `left`, and `right` multipart files. All three challenges must pass before identity matching. `attendx_liveness.py` contains the supplied MediaPipe FaceLandmarker metrics and `LivenessSession` state machine. Business outcomes use HTTP 200; missing/invalid files use HTTP 400. Image and video bytes are parsed in memory and are not saved by the face service. OpenCV decodes the still images, applies EXIF orientation where present, and retries face detection after quarter-turn rotations.

## Manual verification checks

Use consented test media; do not commit it. Set paths for an enrolled reference, same-person selfie, different-person selfie, no-face image, and one clip for each liveness action:

```powershell
$env:SAME_REFERENCE = 'C:\images\person_reference.jpg'
$env:SAME_SELFIE = 'C:\images\person_selfie.jpg'
$env:DIFFERENT_SELFIE = 'C:\images\other_person.jpg'
$env:NO_FACE_IMAGE = 'C:\images\empty_room.jpg'
$env:BLINK_CLIP = 'C:\images\blink.mp4'
$env:LEFT_CLIP = 'C:\images\left.mp4'
$env:RIGHT_CLIP = 'C:\images\right.mp4'
# Optional:
$env:DEVICE_SELFIE = 'C:\images\phone_in_frame.jpg'
python test_verify.py
```

The script prints PASS/FAIL for each provided case and SKIP when image paths are absent. A photo with a device should return `device_detected`; the exact outcome depends on its visibility and detector confidence.

## Backend integration

In `backend/.env`, set:

```dotenv
FACE_MOCK=false
FACE_SERVICE_URL=http://127.0.0.1:8000
```

Keep the backend and service on the same machine for this URL. Start the face service first, then the backend. From another device, use the host computer's LAN address for `FACE_SERVICE_URL` only if the backend runs on that device; the mobile app itself talks to the backend, which forwards the image to this service.

Attendance endpoint smoke check (replace the token, selfie path, and campus coordinates; location/time checks still apply):

```powershell
curl.exe -X POST http://127.0.0.1:5000/api/attendance/mark `
  -H "Authorization: Bearer YOUR_TOKEN" `
  -F "selfie=@C:\images\person_selfie.jpg" `
  -F "blink=@C:\images\blink.mp4" `
  -F "left=@C:\images\left.mp4" `
  -F "right=@C:\images\right.mp4" `
  -F "latitude=YOUR_CAMPUS_LAT" `
  -F "longitude=YOUR_CAMPUS_LNG"
```

The mobile camera records a 6.5-second MP4 for each prompted action in a randomized order (look straight for 1.2 seconds, then do the prompted action), then takes the identity selfie and submits all five files. A successful response confirms the backend called `/verify`; liveness and face rejection messages are returned to the app. The endpoint also checks GPS mock status, accuracy, and campus geofence.
