import { campus } from "../config/campus";

const toRad = (d: number) => (d * Math.PI) / 180;

export const distanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

export const isInsideCampus = (lat: number, lon: number) =>
  distanceMeters(lat, lon, campus.latitude, campus.longitude) <= campus.radiusMeters;

export const isCampusWifi = (ssid?: string, allowedSSIDs = campus.allowedSSIDs) => {
  const normalizedSSID = ssid?.trim().replace(/^\"|\"$/g, "");
  return !!normalizedSSID && allowedSSIDs.includes(normalizedSSID);
};
