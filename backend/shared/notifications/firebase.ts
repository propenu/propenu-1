import path from "path";
import fs from "fs";
import admin from "firebase-admin";
import dotenv from "dotenv";
dotenv.config();

const DEFAULT_SERVICE_ACCOUNT_PATH = "backend/firebase-service-account.json";

const findExistingServiceAccountPath = (startDir: string) => {
  let currentDir = path.resolve(startDir);

  while (true) {
    const candidates = [
      path.join(currentDir, DEFAULT_SERVICE_ACCOUNT_PATH),
      path.join(currentDir, "firebase-service-account.json"),
    ];

    const found = candidates.find((candidate) => fs.existsSync(candidate));
    if (found) return found;

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) return null;
    currentDir = parentDir;
  }
};

const getServiceAccountPath = () => {
  const configuredPath = process.env.FIREBASE_KEY_PATH;
  const targetPath = configuredPath || DEFAULT_SERVICE_ACCOUNT_PATH;

  if (path.isAbsolute(targetPath)) {
    return targetPath;
  }

  const cwdPath = path.resolve(process.cwd(), targetPath);
  if (fs.existsSync(cwdPath)) {
    return cwdPath;
  }

  const discoveredPath =
    findExistingServiceAccountPath(process.cwd()) ||
    findExistingServiceAccountPath(__dirname);

  if (discoveredPath) {
    return discoveredPath;
  }

  return cwdPath;
};

const parseServiceAccount = () => {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    }

    const serviceAccountPath = getServiceAccountPath();

    console.log("Firebase Path:", serviceAccountPath);

    if (!fs.existsSync(serviceAccountPath)) {
      console.warn(
        "Firebase service account file not found. Push notifications are disabled until FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_KEY_PATH is configured.",
      );
      return null;
    }

    return JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));
  } catch (error) {
    console.warn(
      "Firebase service account could not be loaded. Push notifications are disabled.",
      error,
    );
    return null;
  }
};

if (!admin.apps.length) {
  const serviceAccount = parseServiceAccount();

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
}

export const isFirebaseMessagingEnabled = () => admin.apps.length > 0;

export default admin;
