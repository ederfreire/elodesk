import { exec } from "child_process";
import path from "path";
import fs from "fs";

export const CreateZipService = async (): Promise<string> => {
  const rootPath = path.resolve(__dirname, "..", "..", "..");
  const zipPath = path.resolve("/tmp", "equipechat-full.zip");

  // Remove existing zip if any
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  return new Promise((resolve, reject) => {
    // We use a relative path command to avoid absolute paths in the zip
    const command = `cd ${rootPath} && zip -r ${zipPath} . -x "node_modules/*" "backend/node_modules/*" "frontend/node_modules/*" ".git/*" ".next/*" "dist/*" "build/*"`;
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`exec error: ${error}`);
        return reject(new Error("Error creating project zip"));
      }
      resolve(zipPath);
    });
  });
};
