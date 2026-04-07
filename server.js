import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Раздача статических файлов через обработчик
app.get(/\.(css|js|ico|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/, (req, res) => {
  const filePath = path.join(__dirname, req.path);

  // Определяем MIME типы
  const mimeTypes = {
    ".css": "text/css",
    ".js": "application/javascript",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".eot": "application/vnd.ms-fontobject",
  };

  const ext = path.extname(req.path);
  const mimeType = mimeTypes[ext] || "application/octet-stream";

  res.type(mimeType);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).send("Not found");
    }
  });
});

const GEMINI_KEY = process.env.GEMINI_KEY;

// ===== Маршрут для главной страницы =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ===== Чат-бот через Gemini =====
app.post("/ask", async (req, res) => {
  const prompt = req.body.prompt;
  if (!prompt) return res.status(400).json({ error: "No prompt" });

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": GEMINI_KEY,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: "Ты экологический ассистент. Местоположение: Петропавловск, СКО. Отвечай ТОЛЬКО на вопросы об экологии, загрязнении воздуха и воды, климате, природоохранении и других экологических проблемах. На вопросы не по теме отвечай: 'Я помогаю только с вопросами по экологии. Пожалуйста, задайте вопрос о состоянии окружающей среды.'",
              },
            ],
          },
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        }),
      },
    );
    const data = await response.json();
    if (
      !data.candidates ||
      !data.candidates[0] ||
      !data.candidates[0].content ||
      !data.candidates[0].content.parts ||
      !data.candidates[0].content.parts[0]
    ) {
      return res.status(400).json({ error: "Некорректный ответ от API: " + JSON.stringify(data) });
    }
    res.json({ reply: data.candidates[0].content.parts[0].text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Данные о загрязнении воздуха через OpenAQ =====
app.get("/pollution", async (req, res) => {
  try {
    const response = await fetch("https://api.openaq.org/v2/latest?city=Petropavl");
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Главная страница =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ===== Fallback для всех остальных маршрутов (SPA) =====
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
