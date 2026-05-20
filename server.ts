import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import detectChampionsHandler from "./api/detect-champions";

dotenv.config();

const app = express();
const PORT = 3000;

// High limits for base64 image parsing
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ limit: "25mb", extended: true }));

// API endpoint to detect champions using shared handler (acts as Serverless Function on Vercel)
app.post("/api/detect-champions", detectChampionsHandler);

// Setup Vite Dev Server / Static Asset Serving
async function init() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

init();
