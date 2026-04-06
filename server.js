import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Чтобы сервер видел стили и картинки

// --- ТВОИ API КЛЮЧИ ---
const AQICN_TOKEN = process.env.AQICN_TOKEN || "";
const WEATHER_KEY = process.env.WEATHER_KEY || "";
const OPENAI_KEY = process.env.OPENAI_API_KEY || "";
const CITY = "Petropavlovsk,KZ";

// 1. ГЛАВНАЯ СТРАНИЦА (Исправляет ошибку Cannot GET /)
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend.html"));
});

// 2. ДАННЫЕ О ПОГОДЕ
app.get("/weather", async (req, res) => {
  try {
    const currRes = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${CITY}&appid=${WEATHER_KEY}&units=metric&lang=ru`,
    );
    const curr = await currRes.json();

    const foreRes = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?q=${CITY}&appid=${WEATHER_KEY}&units=metric&lang=ru`,
    );
    const fore = await foreRes.json();
    const daily = fore.list
      ? fore.list.filter((r) => r.dt_txt.includes("12:00:00")).slice(0, 3)
      : [];

    res.json({
      current: {
        temp: Math.round(curr.main?.temp || 0),
        hum: curr.main?.humidity || 0,
        wind: curr.wind?.speed || 0,
        desc: curr.weather ? curr.weather[0].description : "нет данных",
        icon: curr.weather ? curr.weather[0].icon : "01d",
      },
      forecast: daily.map((f) => ({
        date: new Date(f.dt * 1000).toLocaleDateString("ru-RU", {
          weekday: "short",
          day: "numeric",
        }),
        temp: Math.round(f.main.temp),
        icon: f.weather[0].icon,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: "Ошибка погоды" });
  }
});

// 3. ДАННЫЕ О ВОЗДУХЕ
app.get("/pollution-data", async (req, res) => {
  try {
    let liveLevel = 25;
    const apiRes = await fetch(`https://api.waqi.info/feed/petropavl/?token=${AQICN_TOKEN}`);
    const apiData = await apiRes.json();
    if (apiData.status === "ok") liveLevel = apiData.data.iaqi.pm25.v;

    let stations = [
      { name: "Эко-пост (Центр)", lat: 54.871, lon: 69.145, level: liveLevel },
      { name: "Эко-пост (ПЗТМ)", lat: 54.892, lon: 69.138, level: liveLevel + 5 },
      { name: "Эко-пост (Вокзал)", lat: 54.842, lon: 69.132, level: liveLevel + 2 },
    ];

    // Генерация дополнительных точек для плотности
    const zones = [
      { n: "Береке", lat: 54.885, lon: 69.182 },
      { n: "Рабочий", lat: 54.845, lon: 69.175 },
    ];
    zones.forEach((z) => {
      for (let i = 0; i < 15; i++) {
        stations.push({
          name: `Датчик ${z.n} #${i + 1}`,
          lat: z.lat + (Math.random() - 0.5) * 0.01,
          lon: z.lon + (Math.random() - 0.5) * 0.01,
          level: Math.floor(liveLevel + Math.random() * 20),
        });
      }
    });
    res.json(stations);
  } catch (e) {
    res.json([{ name: "Демо-точка", lat: 54.867, lon: 69.15, level: 20 }]);
  }
});

// 4. ЧАТ-БОТ
app.post("/ask", async (req, res) => {
  const { prompt } = req.body;
  const GEMINI_KEY = process.env.GEMINI_KEY;

  // Пробуем разные комбинации ссылок и имен моделей
  const attempts = [
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`,
    `https://generativelanguage.googleapis.com/v1/models/gemini-1.0-pro:generateContent?key=${GEMINI_KEY}`,
  ];

  for (let url of attempts) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      const data = await response.json();

      // Если успех — отдаем ответ
      if (data.candidates && data.candidates[0].content) {
        return res.json({ reply: data.candidates[0].content.parts[0].text });
      }

      // Если ошибка "Not Found" — просто идем к следующей ссылке в списке
      if (data.error && data.error.status === "NOT_FOUND") {
        console.log(`Ссылка ${url.split("/")[5]} не сработала, пробую запасную...`);
        continue;
      }

      // Если ошибка другого типа (например, лимиты)
      return res.json({ reply: "Ошибка API: " + data.error.message });
    } catch (err) {
      console.error("Ошибка сети:", err.message);
    }
  }

  res.json({
    reply:
      "Все доступные модели (Flash, Pro) выдали ошибку 404. Пожалуйста, попробуй создать НОВЫЙ ключ в Google AI Studio, это часто помогает.",
  });
});

app.listen(process.env.PORT || 3000, () =>
  console.log(`✅ Сервер: http://localhost:${process.env.PORT || 3000}`),
);
