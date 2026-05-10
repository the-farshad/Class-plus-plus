import { google } from "googleapis";
import { Readable } from "node:stream";
import fs from "node:fs";
import { config } from "./config.js";

let _drive = null;

function getDrive() {
  if (_drive) return _drive;
  if (!config.driveKeyPath || !fs.existsSync(config.driveKeyPath)) {
    throw new Error("Drive service-account key not configured (DRIVE_KEY_PATH)");
  }
  if (!config.driveFolderId) {
    throw new Error("DRIVE_FOLDER_ID not set");
  }
  const auth = new google.auth.GoogleAuth({
    keyFile: config.driveKeyPath,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  _drive = google.drive({ version: "v3", auth });
  return _drive;
}

export async function uploadToDrive(buffer, name, mimeType) {
  const drive = getDrive();
  const created = await drive.files.create({
    requestBody: {
      name,
      parents: [config.driveFolderId],
      mimeType,
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: "id, webViewLink, webContentLink",
    supportsAllDrives: true,
  });

  await drive.permissions.create({
    fileId: created.data.id,
    requestBody: { role: "reader", type: "anyone" },
    supportsAllDrives: true,
  });

  return {
    file_id: created.data.id,
    web_view_link: created.data.webViewLink,
  };
}
