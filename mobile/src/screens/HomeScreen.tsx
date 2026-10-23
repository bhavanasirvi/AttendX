import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import Geolocation from "react-native-geolocation-service";
import { Camera, useCameraDevice } from "react-native-vision-camera";
import AppButton from "../components/AppButton";
import BrandMark, { BrandWordmark } from "../components/BrandMark";
import BottomNav, { TabKey } from "../components/BottomNav";
import NeuralBackdrop from "../components/NeuralBackdrop";
import ScreenShell from "../components/ScreenShell";
import StatusCard from "../components/StatusCard";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";
import { colors, fontSizes, radius, spacing } from "../theme";

const getLocation = () =>
  new Promise<Geolocation.GeoPosition>((resolve, reject) =>
    Geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
      forceRequestLocation: true,
      showLocationDialog: true,
    })
  );

type Challenge = "blink" | "left" | "right";

const recordChallengeClip = (
  camera: Camera,
  challenge: Challenge,
  setPrompt: (prompt: string) => void
) => new Promise<string>((resolve, reject) => {
  let actionTimer: ReturnType<typeof setTimeout> | undefined;
  let stopTimer: ReturnType<typeof setTimeout> | undefined;
  const clearTimers = () => {
    if (actionTimer) clearTimeout(actionTimer);
    if (stopTimer) clearTimeout(stopTimer);
  };
  const actionPrompt = {
    blink: "Blink naturally now",
    left: "Turn your head LEFT",
    right: "Turn your head RIGHT",
  }[challenge];

  try {
    camera.startRecording({
      fileType: "mp4",
      videoCodec: "h264",
      onRecordingError: (error) => {
        clearTimers();
        reject(error);
      },
      onRecordingFinished: (video) => {
        clearTimers();
        resolve(video.path);
      },
    });
    setPrompt("Look straight at the camera...");
    actionTimer = setTimeout(() => setPrompt(actionPrompt), 900);
    stopTimer = setTimeout(() => {
      camera.stopRecording().catch((error) => {
        clearTimers();
        reject(error);
      });
    }, 6200);
  } catch (error) {
    clearTimers();
    reject(error);
  }
});

const requestAppPermissions = async () => {
  if (Platform.OS !== "android") return true;
  const res = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  ]);

  return (
    res[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED &&
    res[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED
  );
};

type Flow = "dashboard" | "precheck" | "camera" | "verifying" | "ready" | "submitting" | "result";
type AttendancePath = "/attendance/mark" | "/attendance/checkout";
type ResultMessage = { text: string; ok: boolean } | null;
type AttendanceRecord = {
  _id: string;
  date: string;
  markedAt: string;
  checkOutAt?: string | null;
  latitude?: number;
  longitude?: number;
  gpsAccuracyMeters?: number;
  campusName?: string;
  wifiSSID?: string;
  checkOutLatitude?: number;
  checkOutLongitude?: number;
  checkOutGpsAccuracyMeters?: number;
  checkOutWifiSSID?: string;
};

export default function HomeScreen() {
  const { token, user, logout } = useAuth();
  const device = useCameraDevice("front");
  const camera = useRef<Camera>(null);
  const captureRef = useRef<{ verificationTicket: string; location: { latitude: number; longitude: number; accuracy: number; wifiSSID: string } } | null>(null);
  const [granted, setGranted] = useState(false);
  const [checkingPermissions, setCheckingPermissions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [livenessPrompt, setLivenessPrompt] = useState("Tap to start and follow all 3 prompts");
  const [verificationStage, setVerificationStage] = useState<"face" | "location">("face");
  const [faceVerified, setFaceVerified] = useState(false);
  const [locationVerified, setLocationVerified] = useState(false);
  const [msg, setMsg] = useState<ResultMessage>(null);
  const [debug, setDebug] = useState("");
  const [tab, setTab] = useState<TabKey>("home");
  const [flow, setFlow] = useState<Flow>("dashboard");
  const [pendingPath, setPendingPath] = useState<AttendancePath>("/attendance/mark");
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [attendanceError, setAttendanceError] = useState("");
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const refreshTodayAttendance = async () => {
    if (!token) return;
    setAttendanceLoading(true);
    try {
      setTodayRecord(await api("/attendance/me/today", { token }));
      setAttendanceError("");
    } catch (error: any) {
      setAttendanceError(error?.message || "Could not load today's attendance");
    } finally {
      setAttendanceLoading(false);
    }
  };

  const loadHistory = async () => {
    if (!token) return;
    setHistoryLoading(true);
    try {
      setHistory(await api("/attendance/me/history", { token }));
      setHistoryError("");
    } catch (error: any) {
      setHistoryError(error?.message || "Could not load attendance history");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    void refreshTodayAttendance();
  }, [token]);

  const beginVerification = async (path: AttendancePath) => {
    setPendingPath(path);
    setMsg(null);
    setDebug("");
    setFaceVerified(false);
    setLocationVerified(false);
    captureRef.current = null;
    setCameraReady(false);
    setLivenessPrompt("Tap to start and follow all 3 prompts");
    setTab("verify");
    setFlow("precheck");
    if (granted || checkingPermissions) return;
    setCheckingPermissions(true);
    try {
      setGranted(await requestAppPermissions());
    } finally {
      setCheckingPermissions(false);
    }
  };

  const buildCaptureForm = (photoPath: string, clips: Record<Challenge, string>) => {
    const form = new FormData();
    form.append("selfie", { uri: `file://${photoPath}`, name: "selfie.jpg", type: "image/jpeg" } as any);
    (['blink', 'left', 'right'] as Challenge[]).forEach((challenge) => {
      form.append(challenge, { uri: `file://${clips[challenge]}`, name: `${challenge}.mp4`, type: "video/mp4" } as any);
    });
    return form;
  };

  const submit = async (_path: AttendancePath) => {
    const activeCamera = camera.current;
    if (busy || !activeCamera || !cameraReady) return;
    setBusy(true);
    setMsg(null);
    setDebug("");
    setFaceVerified(false);
    setLocationVerified(false);
    try {
      // Keep the Camera mounted until the native capture promise completes.
      const challengeOrder: Challenge[] = ["blink", "left", "right"];
      for (let i = challengeOrder.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [challengeOrder[i], challengeOrder[j]] = [challengeOrder[j], challengeOrder[i]];
      }
      const challengeClips: Record<Challenge, string> = { blink: "", left: "", right: "" };
      for (const challenge of challengeOrder) {
        setLivenessPrompt(`Starting ${challenge.toUpperCase()} check...`);
        challengeClips[challenge] = await recordChallengeClip(activeCamera, challenge, setLivenessPrompt);
      }
      setLivenessPrompt("Capturing selfie...");
      const photo = await activeCamera.takePhoto({ flash: "off" });
      setFlow("verifying");
      setVerificationStage("face");
      const faceForm = buildCaptureForm(photo.path, challengeClips);
      const faceResult = await api("/attendance/verify-face", { method: "POST", token, form: faceForm, timeoutMs: 120000 });
      setFaceVerified(true);
      setVerificationStage("location");
      const position = await getLocation();
      const { latitude, longitude, accuracy } = position.coords;
      const network = await NetInfo.fetch("wifi");
      const wifiSSID = (network.details as any)?.ssid || "";
      const location = { latitude, longitude, accuracy, wifiSSID };
      const locationResult = await api("/attendance/check-location", {
        method: "POST", token,
        body: {
          latitude, longitude, accuracy, wifiSSID,
          isMockLocation: !!(position as any).mocked,
          faceProof: faceResult.faceProof,
          action: _path === "/attendance/checkout" ? "checkout" : "checkin",
        },
      });
      captureRef.current = { verificationTicket: locationResult.verificationTicket, location };
      setLocationVerified(true);
      setDebug(`Campus: SKIT Jaipur\nLatitude: ${latitude.toFixed(6)}\nLongitude: ${longitude.toFixed(6)}\nAccuracy: ±${Math.round(accuracy)} m\nWi-Fi: ${wifiSSID}`);
      setBusy(false);
      setFlow("ready");
      return;
    } catch (e: any) {
      const text = e?.code === 2
        ? "GPS is unavailable. Turn on Location and try again."
        : e?.code === 3
          ? "GPS location timed out. Move outdoors and try again."
          : e?.message || "Something went wrong";
      setMsg({ text, ok: false });
      setBusy(false);
      setFlow("result");
      return;
    }
  };

  const markAttendance = async () => {
    const captured = captureRef.current;
    if (!captured || busy) return;
    setBusy(true);
    setFlow("submitting");
    try {
      const data = await api(pendingPath, {
        method: "POST", token, body: { verificationTicket: captured.verificationTicket },
      });
      setTodayRecord(data.attendance);
      const checkOut = pendingPath === "/attendance/checkout";
      const resultLatitude = checkOut ? data.attendance.checkOutLatitude : data.attendance.latitude;
      const resultLongitude = checkOut ? data.attendance.checkOutLongitude : data.attendance.longitude;
      const resultAccuracy = checkOut ? data.attendance.checkOutGpsAccuracyMeters : data.attendance.gpsAccuracyMeters;
      const resultSSID = checkOut ? data.attendance.checkOutWifiSSID : data.attendance.wifiSSID;
      setDebug(`Location: ${data.attendance.campusName || "SKIT Jaipur"}\nLatitude: ${Number(resultLatitude).toFixed(6)}\nLongitude: ${Number(resultLongitude).toFixed(6)}\nAccuracy: ${Math.round(resultAccuracy)} m\nWi-Fi: ${resultSSID}`);
      setMsg({ text: data.message, ok: true });
    } catch (e: any) {
      void refreshTodayAttendance();
      setMsg({ text: e?.message || "Something went wrong", ok: false });
    } finally {
      setBusy(false);
      setFlow("result");
    }
  };
  const handleTab = (next: TabKey) => {
    if (next === "history") {
      setTab(next);
      void loadHistory();
      return;
    }
    if (next === "verify") {
      beginVerification(pendingPath);
      return;
    }
    setTab(next);
    if (next === "home") setFlow("dashboard");
  };

  const content = () => {
    if (tab === "history") return <HistoryView records={history} loading={historyLoading} error={historyError} />;
    if (tab === "profile") return <ProfileView user={user} logout={logout} />;
    if (flow === "precheck") {
      return (
        <PrecheckView
          mode={pendingPath === "/attendance/mark" ? "Check In" : "Check Out"}
          granted={granted}
          checkingPermissions={checkingPermissions}
          onBack={() => {
            setTab("home");
            setFlow("dashboard");
          }}
          onProceed={() => {
            setCameraReady(false);
            setFlow("camera");
          }}
        />
      );
    }
    if (flow === "camera") {
      return (
        <CameraView
          granted={granted}
          device={device}
          camera={camera}
          busy={busy}
          cameraReady={cameraReady}
          livenessPrompt={livenessPrompt}
          onCameraReady={() => setCameraReady(true)}
          onClose={() => {
            setCameraReady(false);
            setFlow("precheck");
          }}
          onCapture={() => submit(pendingPath)}
        />
      );
    }
    if (flow === "verifying") return <VerifyingView stage={verificationStage} faceVerified={faceVerified} />;
    if (flow === "ready") return (
      <VerificationReadyView
        mode={pendingPath === "/attendance/mark" ? "Check In" : "Check Out"}
        faceVerified={faceVerified}
        locationVerified={locationVerified}
        details={debug}
        onMark={markAttendance}
      />
    );
    if (flow === "submitting") return <SubmittingView mode={pendingPath === "/attendance/mark" ? "check-in" : "check-out"} />;
    if (flow === "result") {
      return (
        <ResultView
          msg={msg}
          debug={debug}
          successTitle={pendingPath === "/attendance/mark" ? "Check-in Successful" : "Check-out Successful"}
          onDone={() => {
            setTab("home");
            setFlow("dashboard");
          }}
          onRetry={() => {
            setCameraReady(false);
            setFlow("camera");
          }}
        />
      );
    }
    return (
      <DashboardView
        user={user}
        attendance={todayRecord}
        attendanceLoading={attendanceLoading}
        attendanceError={attendanceError}
        onCheckIn={() => beginVerification("/attendance/mark")}
        onCheckOut={() => beginVerification("/attendance/checkout")}
      />
    );
  };

  const showNav = !["camera", "verifying", "ready", "submitting"].includes(flow);

  return (
    <ScreenShell padded={false}>
      <View style={styles.app}>
        <NeuralBackdrop />
        <View style={styles.content}>
          <FadeInPage pageKey={`${tab}-${flow}`}>{content()}</FadeInPage>
        </View>
        {showNav && <BottomNav active={tab} onChange={handleTab} />}
      </View>
    </ScreenShell>
  );
}

function FadeInPage({ pageKey, children }: { pageKey: string; children: React.ReactNode }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [pageKey, progress]);
  return <Animated.View style={[styles.transitionPage, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>{children}</Animated.View>;
}

function VerificationReadyView({ mode, faceVerified, locationVerified, details, onMark }: {
  mode: string; faceVerified: boolean; locationVerified: boolean; details: string; onMark: () => void;
}) {
  return (
    <View style={styles.page}>
      <Text style={styles.sectionTitle}>Verification Complete</Text>
      <Text style={styles.readySubtitle}>Review the checks, then mark your attendance.</Text>
      <VerifiedRow label="Verified live face" verified={faceVerified} />
      <VerifiedRow label="GPS location and network Wi-Fi" verified={locationVerified} />
      <View style={styles.locationCard}>
        <Text style={styles.receiptLabel}>Verified details</Text>
        <Text style={styles.locationValue}>{details}</Text>
      </View>
      <View style={styles.bottomPinned}>
        <AppButton title={mode === "Check In" ? "Mark Check-In Attendance" : "Mark Check-Out Attendance"} onPress={onMark} disabled={!faceVerified || !locationVerified} />
      </View>
    </View>
  );
}

function VerifiedRow({ label, verified }: { label: string; verified: boolean }) {
  return (
    <View style={styles.verifiedRow}>
      <Text style={styles.verifiedLabel}>{label}</Text>
      <View style={[styles.smallCheck, !verified && styles.pendingCheck]}>
        {verified ? <Text style={styles.checkGlyph}>✓</Text> : <ActivityIndicator size="small" color={colors.cyan} />}
      </View>
    </View>
  );
}

function DashboardView({
  user,
  attendance,
  attendanceLoading,
  attendanceError,
  onCheckIn,
  onCheckOut,
}: {
  user: any;
  attendance: AttendanceRecord | null;
  attendanceLoading: boolean;
  attendanceError: string;
  onCheckIn: () => void;
  onCheckOut: () => void;
}) {
  return (
    <View style={styles.page}>
      <BrandHeader />
      <View style={styles.profileRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(user?.name)}</Text>
        </View>
        <View>
          <Text style={styles.staffName}>{user?.name || "Staff Member"}</Text>
          <Text style={styles.staffMeta}>{user?.empId || "Registered Staff"} - SKIT</Text>
        </View>
      </View>
      <StatusCard
        eyebrow="Today's Status"
        title={attendance?.checkOutAt ? "Attendance Complete" : attendance ? "Checked In" : "Pending Attendance"}
        subtitle={attendanceError || (attendance
          ? `Check-in ${formatTime(attendance.markedAt)}${attendance.checkOutAt ? ` · Check-out ${formatTime(attendance.checkOutAt)}` : ""}`
          : attendanceLoading ? "Loading today's attendance..." : "No attendance marked yet")}
        tone={attendance?.checkOutAt ? "success" : attendance ? "warning" : "warning"}
      />
      <View style={styles.actions}>
        <AppButton
          title={attendance && !attendance.checkOutAt ? "Checked In" : attendance?.checkOutAt ? "Check In Again" : "Check In Now"}
          onPress={onCheckIn}
          disabled={attendanceLoading || (!!attendance && !attendance.checkOutAt)}
          style={styles.fullButton}
        />
        <AppButton
          title={attendance?.checkOutAt ? "Checked Out" : "Check Out"}
          onPress={onCheckOut}
          disabled={attendanceLoading || !attendance || !!attendance.checkOutAt}
          tone="ghost"
          style={styles.fullButton}
        />
      </View>
    </View>
  );
}

function PrecheckView({
  mode,
  granted,
  checkingPermissions,
  onBack,
  onProceed,
}: {
  mode: string;
  granted: boolean;
  checkingPermissions: boolean;
  onBack: () => void;
  onProceed: () => void;
}) {
  return (
    <View style={styles.page}>
      <View style={styles.headerLine}>
        <Pressable onPress={onBack} style={styles.backButton} accessibilityRole="button">
          <Text style={styles.backText}>{"<"}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Pre-Verification Check</Text>
      </View>
      <StatusCard
        title="Campus Geofence"
        subtitle="GPS is checked after face verification; Location permission is required."
        status={checkingPermissions ? "Checking" : granted ? "Ready" : "Needs Access"}
        tone={granted ? "success" : "danger"}
      />
      <StatusCard
        title="Identity Capture"
        subtitle={`${mode} requires a live front-camera selfie`}
        status="Ready"
        tone="success"
      />
      <View style={styles.bottomPinned}>
        <AppButton
          title={checkingPermissions ? "Checking Permissions..." : "Proceed to Camera Capture"}
          onPress={onProceed}
          disabled={!granted || checkingPermissions}
        />
      </View>
    </View>
  );
}

function CameraView({
  granted,
  device,
  camera,
  busy,
  cameraReady,
  livenessPrompt,
  onCameraReady,
  onClose,
  onCapture,
}: {
  granted: boolean;
  device: ReturnType<typeof useCameraDevice>;
  camera: React.RefObject<Camera | null>;
  busy: boolean;
  cameraReady: boolean;
  livenessPrompt: string;
  onCameraReady: () => void;
  onClose: () => void;
  onCapture: () => void;
}) {
  return (
    <View style={styles.cameraPage}>
      {granted && device ? (
        <Camera
          ref={camera}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive
          photo
          video
        videoBitRate={2}
          audio={false}
          onInitialized={onCameraReady}
        />
      ) : (
        <Text style={styles.permissionText}>Camera / location permission required</Text>
      )}
      <View style={styles.faceGuide}>
        <View style={styles.faceLine} />
        <View style={styles.faceHead} />
        <View style={styles.faceBody} />
      </View>
      <Text style={styles.challengePrompt}>{livenessPrompt}</Text>
      <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button">
        <Text style={styles.closeText}>x</Text>
      </Pressable>
      <Pressable
        disabled={busy || !granted || !device || !cameraReady}
        onPress={onCapture}
        style={({ pressed }) => [styles.capture, (pressed || busy) && styles.pressed]}
        accessibilityRole="button"
      >
        <View style={styles.captureInner} />
      </Pressable>
    </View>
  );
}

function VerifyingView({ stage, faceVerified }: { stage: "face" | "location"; faceVerified: boolean }) {
  return (
    <View style={styles.centerPage}>
      <View style={styles.brandRow}><BrandMark size={52} /><BrandWordmark size={26} /></View>
      <View style={styles.checkList}>
        <VerifiedRow label="Verifying the live face" verified={faceVerified} />
        {faceVerified && <Text style={styles.verifiedCaption}>Verified live face</Text>}
        {stage === "location" && <VerifiedRow label="Verifying GPS location and Wi-Fi" verified={false} />}
        {stage === "location" && <Text style={styles.processingCaption}>Checking your campus location and connected network…</Text>}
      </View>
    </View>
  );
}

function SubmittingView({ mode }: { mode: string }) {
  return (
    <View style={styles.centerPage}>
      <View style={styles.brandRow}><BrandMark size={52} /><BrandWordmark size={26} /></View>
      <View style={styles.spinnerDisk}><ActivityIndicator color={colors.cyan} size="large" /></View>
      <Text style={styles.resultTitle}>Marking {mode}…</Text>
      <Text style={styles.readySubtitle}>Saving your verified attendance securely.</Text>
    </View>
  );
}

function ResultView({
  msg,
  debug,
  successTitle,
  onDone,
  onRetry,
}: {
  msg: ResultMessage;
  debug: string;
  successTitle: string;
  onDone: () => void;
  onRetry: () => void;
}) {
  const ok = !!msg?.ok;
  const pop = useRef(new Animated.Value(0.75)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5, tension: 100 }).start();
  }, [pop]);
  return (
    <View style={styles.page}>
      <View style={styles.resultTop}>
        <Animated.View style={[styles.resultBadge, ok ? styles.okBadge : styles.failBadge, { transform: [{ scale: pop }] }]}>
          <Text style={[styles.resultSymbol, ok ? styles.okText : styles.failText]}>
            {ok ? "✓" : "!"}
          </Text>
        </Animated.View>
        <Text style={styles.resultTitle}>
          {ok ? successTitle : "Verification Failed"}
        </Text>
        {!!msg?.text && <Text style={styles.resultMessage}>{msg.text}</Text>}
        {ok && <View style={styles.successBrand}><BrandMark size={56} /><BrandWordmark size={24} /></View>}
        {ok && <Text style={styles.verifiedCaption}>Your attendance has been marked by AttendX</Text>}
        {!!debug && (
          <View style={styles.locationCard}>
            <Text style={styles.receiptLabel}>Detected GPS Location</Text>
            <Text style={styles.locationValue}>{debug}</Text>
          </View>
        )}
      </View>
      <View style={styles.bottomPinned}>
        <AppButton
          title={ok ? "Done" : "Retry Verification"}
          tone={ok ? "success" : "primary"}
          onPress={ok ? onDone : onRetry}
        />
      </View>
    </View>
  );
}

const formatTime = (value?: string | null) =>
  value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";

const formatDate = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });

function HistoryView({
  records,
  loading,
  error,
}: {
  records: AttendanceRecord[];
  loading: boolean;
  error: string;
}) {
  return (
    <View style={styles.page}>
      <View style={styles.historyTitle}><BrandHeader /><Text style={styles.sectionTitle}>Attendance Log</Text></View>
      {!!error && <Text style={styles.historyEmpty}>{error}</Text>}
      {loading ? (
        <ActivityIndicator color={colors.cyan} size="large" />
      ) : records.length ? (
        <ScrollView style={styles.historyScroll} contentContainerStyle={styles.historyList}>
          {records.map((record) => (
            <View key={record._id} style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <View>
                  <Text style={styles.logDate}>{formatDate(record.date)}</Text>
                  <Text style={styles.logMeta}>{record.checkOutAt ? "COMPLETE" : "CHECKED IN"}</Text>
                </View>
                <Text style={styles.historyCampus}>{record.campusName || "SKIT Jaipur"}</Text>
              </View>
              <Text style={styles.historyDetail}>Check-in: {formatTime(record.markedAt)}</Text>
              <Text style={styles.historyDetail}>Check-out: {formatTime(record.checkOutAt)}</Text>
              <Text style={styles.historyDetail}>
                Check-in location: {record.latitude?.toFixed(5) ?? "—"}, {record.longitude?.toFixed(5) ?? "—"}
              </Text>
              <Text style={styles.historyDetail}>Check-in GPS accuracy: {record.gpsAccuracyMeters != null ? `${Math.round(record.gpsAccuracyMeters)} m` : "—"}</Text>
              <Text style={styles.historyDetail}>
                Check-out location: {record.checkOutLatitude?.toFixed(5) ?? "—"}, {record.checkOutLongitude?.toFixed(5) ?? "—"}
              </Text>
              <Text style={styles.historyDetail}>Check-out GPS accuracy: {record.checkOutGpsAccuracyMeters != null ? `${Math.round(record.checkOutGpsAccuracyMeters)} m` : "—"}</Text>
              <Text style={styles.historyDetail}>Check-in Wi-Fi: {record.wifiSSID || "—"}</Text>
              <Text style={styles.historyDetail}>Check-out Wi-Fi: {record.checkOutWifiSSID || "—"}</Text>
            </View>
          ))}
        </ScrollView>
      ) : !error ? (
        <Text style={styles.historyEmpty}>No attendance records yet.</Text>
      ) : null}
    </View>
  );
}

function ProfileView({ user, logout }: { user: any; logout: () => void }) {
  return (
    <View style={styles.page}>
      <BrandHeader />
      <View style={styles.profileCenter}>
        <View style={styles.largeAvatar}>
          <Text style={styles.largeAvatarText}>{initials(user?.name)}</Text>
        </View>
        <Text style={styles.staffName}>{user?.name || "Staff Member"}</Text>
        <Text style={styles.staffMeta}>{user?.empId || "Registered Staff"}</Text>
      </View>
      {/* TODO: connect to backend */}
      <StatusCard title="Department" subtitle={user?.role || "Faculty"} status="Active" />
      <View style={styles.bottomPinned}>
        <AppButton title="Logout" tone="danger" onPress={logout} />
      </View>
    </View>
  );
}

function BrandHeader() {
  return <View style={styles.brandHeader}><BrandMark size={34} /><BrandWordmark size={18} /></View>;
}

function initials(name?: string) {
  if (!name) return "PS";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  transitionPage: {
    flex: 1,
  },
  page: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    gap: spacing.lg,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: colors.cyan,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.panel,
  },
  avatarText: {
    color: colors.text,
    fontSize: fontSizes.md,
    fontWeight: "900",
  },
  staffName: {
    color: colors.text,
    fontSize: fontSizes.lg,
    fontWeight: "900",
  },
  staffMeta: {
    color: colors.textSoft,
    fontSize: fontSizes.sm,
    marginTop: spacing.xs,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  fullButton: {
    width: "100%",
  },
  headerLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    color: colors.textSoft,
    fontSize: fontSizes.xl,
    fontWeight: "700",
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSizes.xl,
    fontWeight: "900",
  },
  bottomPinned: {
    marginTop: "auto",
    paddingBottom: spacing.xxl,
  },
  cameraPage: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  permissionText: {
    color: colors.text,
    textAlign: "center",
    padding: spacing.xl,
  },
  faceGuide: {
    width: 250,
    height: 320,
    borderRadius: 130,
    borderWidth: 4,
    borderColor: colors.cyan,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0.82,
  },
  challengePrompt: {
    position: "absolute",
    top: spacing.xxxl,
    left: spacing.xl,
    right: spacing.xl,
    color: colors.text,
    textAlign: "center",
    fontSize: fontSizes.lg,
    fontWeight: "800",
    backgroundColor: "rgba(5, 18, 42, 0.82)",
    padding: spacing.md,
    borderRadius: radius.md,
  },
  faceLine: {
    position: "absolute",
    top: 96,
    left: 24,
    right: 24,
    height: 4,
    backgroundColor: colors.cyan,
  },
  faceHead: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 10,
    borderColor: colors.cyan,
    opacity: 0.55,
  },
  faceBody: {
    width: 72,
    height: 50,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 10,
    borderBottomWidth: 0,
    borderColor: colors.cyan,
    opacity: 0.55,
    marginTop: spacing.sm,
  },
  closeButton: {
    position: "absolute",
    left: spacing.xxl,
    bottom: spacing.xxl,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.black,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: {
    color: colors.text,
    fontSize: fontSizes.xxl,
    lineHeight: 26,
  },
  capture: {
    position: "absolute",
    bottom: spacing.xxl,
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 4,
    borderColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.cyanSoft,
  },
  pressed: {
    opacity: 0.7,
  },
  centerPage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  brandMark: {
    color: colors.text,
    fontSize: fontSizes.xxl,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginBottom: spacing.xl,
  },
  brandRow: {
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  brandHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  historyTitle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  successBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xl,
  },
  checkList: {
    width: "100%",
    gap: spacing.md,
  },
  verifiedRow: {
    minHeight: 58,
    width: "100%",
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
  },
  verifiedLabel: {
    color: colors.text,
    fontSize: fontSizes.md,
    fontWeight: "700",
    flex: 1,
  },
  smallCheck: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#0d4039",
    alignItems: "center",
    justifyContent: "center",
    marginLeft: spacing.md,
  },
  pendingCheck: {
    backgroundColor: colors.background,
  },
  checkGlyph: {
    color: colors.success,
    fontSize: fontSizes.md,
    fontWeight: "900",
  },
  verifiedCaption: {
    color: colors.success,
    textAlign: "center",
    fontSize: fontSizes.md,
    fontWeight: "800",
    marginTop: spacing.sm,
  },
  processingCaption: {
    color: colors.textSoft,
    textAlign: "center",
    fontSize: fontSizes.sm,
    marginTop: spacing.sm,
  },
  readySubtitle: {
    color: colors.textSoft,
    fontSize: fontSizes.md,
    lineHeight: 23,
  },
  spinnerDisk: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xxl,
  },
  resultTop: {
    alignItems: "center",
    paddingTop: spacing.xxl,
  },
  resultBadge: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xxl,
  },
  okBadge: {
    borderColor: colors.success,
    backgroundColor: "#0d4039",
  },
  failBadge: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  resultSymbol: {
    fontSize: fontSizes.xl,
    fontWeight: "900",
  },
  okText: {
    color: colors.success,
  },
  failText: {
    color: colors.danger,
  },
  resultTitle: {
    color: colors.text,
    fontSize: fontSizes.xxl,
    fontWeight: "900",
    textAlign: "center",
  },
  resultMessage: {
    color: colors.text,
    textAlign: "center",
    fontSize: fontSizes.md,
    marginTop: spacing.xl,
  },
  receipt: {
    marginTop: spacing.xl,
    width: "100%",
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    padding: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  receiptLabel: {
    color: colors.textSoft,
    fontSize: fontSizes.md,
    marginBottom: spacing.md,
  },
  receiptValue: {
    color: colors.text,
    fontSize: fontSizes.md,
    fontWeight: "900",
    textAlign: "right",
    marginBottom: spacing.md,
  },
  cyanText: {
    color: colors.cyan,
  },
  locationCard: {
    width: "100%",
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  locationValue: {
    color: colors.cyan,
    textAlign: "center",
    fontSize: fontSizes.md,
    lineHeight: 26,
    fontWeight: "700",
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSizes.xl,
    fontWeight: "900",
    marginBottom: spacing.sm,
  },
  logRow: {
    minHeight: 62,
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  historyList: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  historyScroll: {
    flex: 1,
  },
  historyCard: {
    borderRadius: radius.md,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  historyCampus: {
    color: colors.cyan,
    fontSize: fontSizes.sm,
    fontWeight: "800",
  },
  historyDetail: {
    color: colors.textSoft,
    fontSize: fontSizes.sm,
  },
  historyEmpty: {
    color: colors.textSoft,
    textAlign: "center",
    marginTop: spacing.xl,
  },
  logDate: {
    color: colors.text,
    fontSize: fontSizes.md,
    fontWeight: "900",
  },
  logMeta: {
    color: colors.success,
    fontSize: fontSizes.sm,
    fontWeight: "800",
    marginTop: spacing.xs,
  },
  presentPill: {
    color: colors.success,
    fontSize: fontSizes.xs,
    backgroundColor: "#0b5a5b",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  profileCenter: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  largeAvatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 3,
    borderColor: colors.cyan,
    backgroundColor: colors.panel,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  largeAvatarText: {
    color: colors.text,
    fontSize: fontSizes.xxl,
    fontWeight: "900",
  },
});
