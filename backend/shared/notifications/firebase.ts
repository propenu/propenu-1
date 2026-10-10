import path from "path";
import fs from "fs";
import admin from "firebase-admin";
import dotenv from "dotenv";
dotenv.config();

const DEFAULT_SERVICE_ACCOUNT_PATH = "backend/firebase-service-account.json";

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

  if (!configuredPath) {
    const backendPath = path.resolve(__dirname, "../..", "firebase-service-account.json");
    if (fs.existsSync(backendPath)) {
      return backendPath;
    }
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
