import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// High limits for base64 image parsing
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ limit: "25mb", extended: true }));

// Create Gemini Client
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// API endpoint to detect champions using Gemini
app.post("/api/detect-champions", async (req, res) => {
  try {
    if (!ai) {
      return res.status(500).json({ error: "Gemini API is not configured on the server. Please verify GEMINI_API_KEY." });
    }

    const { image, championList } = req.body;
    if (!image) {
      return res.status(400).json({ error: "Missing image parameter (base64 or data URL/URI formats)." });
    }

    // Extract base64 and mime-type
    let mimeType = "image/png";
    let base64Data = image;

    if (image.includes(";base64,")) {
      const parts = image.split(";base64,");
      mimeType = parts[0].replace("data:", "");
      base64Data = parts[1];
    }

    // Build the instruction listing candidate champion IDs/names as clues
    const championHints = championList && Array.isArray(championList)
      ? championList.map((c: any) => `${c.id} (${c.name})`).join(", ")
      : "Standard LoL champion IDs (e.g., Kaisa, Caitlyn, MonkeyKing, Leesin, Yasuo)";

    const prompt = `Identify League of Legends champions from the uploaded image. Match them to the valid list of champions here:\n${championHints}`;

    const instruction = 
      "You are an AI expert specializing in League of Legends. Your task is to analyze the provided screenshot " +
      "(like a draft view, post-game scoreboard, mobile history app screenshots, match statistics, or loading screen) " +
      "and detect all champions that are shown. Match each champion back to its legal ID in the provided champion list. " +
      "If you cannot determine the side (blue or red), default to 'unknown'. Output in clean JSON matching the requested schema.";

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        },
        prompt
      ],
      config: {
        systemInstruction: instruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            champions: {
              type: Type.ARRAY,
              description: "List of recognized LoL champions in the screenshot",
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "Official champion ID matching the list (e.g., 'Kaisa', 'JarvanIV', 'Aatrox')" },
                  name: { type: Type.STRING, description: "Readable champion name" },
                  team: { type: Type.STRING, enum: ["blue", "red", "unknown"], description: "Which side are they shown under? Blue team or Red team, or unknown if not clear." }
                },
                required: ["id"]
              }
            }
          },
          required: ["champions"]
        }
      }
    });

    const text = response.text || "{}";
    res.json(JSON.parse(text));
  } catch (err: any) {
    console.error("Gemini Detection Error:", err);
    res.status(500).json({ error: err.message || "An error occurred while recognizing champions." });
  }
});

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
