import { NativeModules, Platform } from "react-native";

const getDevServerHost = () => {
  const scriptURL = NativeModules.SourceCode?.scriptURL as string | undefined;
  const host = scriptURL?.match(/\/\/([^/:]+)/)?.[1];
  return host;
};

const getBaseUrls = () => {
  const devHost = getDevServerHost();
  const androidFallback = "http://10.0.2.2:5000/api";
  // The Android launch script runs `adb reverse tcp:5000 tcp:5000`, which
  // makes the host machine's backend available at the device's localhost.
  // This works for both USB devices and emulators and should be tried before
  // the emulator-only 10.0.2.2 address.
  const androidDeviceUrl = "http://127.0.0.1:5000/api";
  const urls = [
    devHost ? `http://${devHost}:5000/api` : undefined,
    Platform.OS === "android" ? androidDeviceUrl : "http://localhost:5000/api",
    Platform.OS === "android" ? androidFallback : undefined,
  ];

  return [...new Set(urls.filter(Boolean))] as string[];
};

export const BASE_URLS = getBaseUrls();
export const BASE_URL = BASE_URLS[0] ?? (Platform.OS === "android" ? "http://10.0.2.2:5000/api" : "http://localhost:5000/api");
const REQUEST_TIMEOUT_MS = 35000;
let brandLogoPromise: Promise<string | null> | null = null;

export const getBrandLogoUri = (): Promise<string | null> => {
  if (!brandLogoPromise) {
    brandLogoPromise = api("/admin/branding", { timeoutMs: 6000 })
      .then((data) => {
        const uri = data.logoUrl || null;
        if (!uri) brandLogoPromise = null;
        return uri;
      })
      .catch(() => { brandLogoPromise = null; return null; });
  }
  return brandLogoPromise;
};

type Opts = { method?: string; token?: string | null; body?: object; form?: FormData; timeoutMs?: number };

export const api = async (path: string, { method = "GET", token, body, form, timeoutMs = REQUEST_TIMEOUT_MS }: Opts = {}) => {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: any;
  if (form) payload = form;
  else if (body) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let networkError: unknown;

  for (const baseUrl of BASE_URLS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: payload,
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (controller.signal.aborted || /abort/i.test(message)) {
        throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)} seconds. Check the backend and try again.`);
      }
      if (message !== "Network request failed" && message !== "Aborted") throw error;
      networkError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw networkError instanceof Error
    ? new Error(`Backend unreachable. Tried: ${BASE_URLS.join(", ")}`)
    : new Error("Backend unreachable");
};
