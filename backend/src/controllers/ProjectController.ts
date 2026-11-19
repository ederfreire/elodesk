import { Request, Response } from "express";
import { CreateZipService } from "../services/ProjectServices/CreateZipService";
import path from "path";
import fs from "fs";

export const downloadZip = async (req: Request, res: Response): Promise<void> => {
  try {
    const zipPath = await CreateZipService();
    
    if (fs.existsSync(zipPath)) {
      res.download(zipPath, "equipechat-full.zip", (err) => {
        if (err) {
          console.error("Error sending file:", err);
        }
        // Optionally delete the file after sending, but since it's in /tmp it will be cleared eventually
      });
    } else {
      res.status(500).json({ error: "Zip file was not created" });
    }
  } catch (err) {
    console.error("Download Zip error:", err);
    res.status(500).json({ error: "Failed to generate project zip" });
  }
};
