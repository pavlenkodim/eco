// ==================== MAP ====================
var map = L.map("map", { zoomControl: false }).setView([54.87, 69.15], 12);
L.control.zoom({ position: "topright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
  attribution: "&copy; OSM",
}).addTo(map);

var markers = [];
var dangerMarkers = [];
var heatLayer = L.heatLayer([], { radius: 25, blur: 15 }).addTo(map);
var lastPollutionResults = null;

// ==================== SIMULATED DATA ====================
function generateSimulatedData() {
  var results = [];
  var zones = [
    { name: "Центр — ТЭЦ-2", lat: 54.8753, lon: 69.163, base: 68, spread: 0.008 },
    { name: "Промзона Юг", lat: 54.845, lon: 69.14, base: 85, spread: 0.012 },
    { name: "Автовокзал", lat: 54.871, lon: 69.151, base: 58, spread: 0.006 },
    { name: "Жилой массив Север", lat: 54.89, lon: 69.155, base: 30, spread: 0.01 },
    { name: "Район ж/д вокзала", lat: 54.868, lon: 69.172, base: 72, spread: 0.007 },
    { name: "Заводской район", lat: 54.852, lon: 69.13, base: 90, spread: 0.01 },
    { name: "Парковая зона", lat: 54.883, lon: 69.168, base: 18, spread: 0.008 },
    { name: "Мкрн Береке", lat: 54.86, lon: 69.18, base: 48, spread: 0.009 },
  ];
  zones.forEach(function (z) {
    var count = 3 + Math.floor(Math.random() * 3);
    for (var i = 0; i < count; i++) {
      var lat = z.lat + (Math.random() - 0.5) * z.spread;
      var lon = z.lon + (Math.random() - 0.5) * z.spread;
      // cap at 95 so danger zones only appear on request
      var level = Math.min(95, Math.max(5, z.base + Math.floor((Math.random() - 0.5) * 30)));
      results.push({
        coordinates: { latitude: lat, longitude: lon },
        measurements: [{ parameter: "pm25", value: level }],
        zoneName: z.name,
      });
    }
  });
  return results;
}

// ==================== LOAD POLLUTION ====================
async function updatePollutionData() {
  var apiData = null;
  try {
    const res = await fetch("https://api.openaq.org/v2/latest?city=Petropavl");
    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0) apiData = data.results;
    }
  } catch (e) {
    console.warn("API недоступен, используем локальные данные", e);
  }

  var results = apiData || generateSimulatedData();
  lastPollutionResults = results;

  markers.forEach((m) => map.removeLayer(m));
  markers = [];
  var heatData = [];
  var sum = 0,
    count = 0,
    dangerCount = 0;

  results.forEach(function (loc) {
    if (!loc.coordinates) return;
    var lat = loc.coordinates.latitude;
    var lon = loc.coordinates.longitude;
    var level = 0;
    loc.measurements.forEach(function (m) {
      if (m.parameter === "pm25") level = m.value;
    });
    sum += level;
    count++;
    if (level > 100) dangerCount++;
    var color = level < 50 ? "#38a169" : level < 100 ? "#dd6b20" : "#e53e3e";
    var popupText = "<b>🌫 Загрязнение воздуха</b><br>PM2.5: <b>" + level + "</b> мкг/м³";
    if (loc.zoneName) popupText += "<br>📍 " + loc.zoneName;
    if (level < 50) popupText += '<br><span style="color:#38a169">✅ В пределах нормы</span>';
    else if (level < 100)
      popupText += '<br><span style="color:#dd6b20">⚠️ Умеренное загрязнение</span>';
    else popupText += '<br><span style="color:#e53e3e">🔴 Опасный уровень!</span>';
    var marker = L.circleMarker([lat, lon], {
      radius: 8,
      color: color,
      fillColor: color,
      fillOpacity: 0.7,
      weight: 1.5,
    }).bindPopup(popupText);
    marker.addTo(map);
    markers.push(marker);
    heatData.push([lat, lon, Math.min(level / 150, 1)]);
  });

  heatLayer.setLatLngs(heatData);
  var avg = Math.round(sum / (count || 1));
  var statusIcon = avg < 50 ? "🟢" : avg < 100 ? "🟡" : "🔴";
  document.getElementById("pollutionPanel").innerText =
    statusIcon + " Экология воздуха — средний PM2.5: " + avg + " мкг/м³";

  // Update sidebar stats
  document.getElementById("statAvg").innerHTML = avg + '<span class="unit">мкг/м³</span>';
  document.getElementById("statCount").textContent = count;
  document.getElementById("statDanger").textContent = dangerCount;
  var barPct = Math.min(100, Math.round(avg / 1.5));
  var bar = document.getElementById("statAvgBar");
  bar.style.width = barPct + "%";
  bar.style.background = avg < 50 ? "#38a169" : avg < 100 ? "#dd6b20" : "#e53e3e";
}

updatePollutionData();
setInterval(updatePollutionData, 300000);

// ==================== WEATHER (Open-Meteo API) ====================
var weatherCodes = {
  0: "☀️ Ясно",
  1: "🌤 Малооблачно",
  2: "⛅ Переменная облачность",
  3: "☁️ Пасмурно",
  45: "🌫 Туман",
  48: "🌫 Изморозь",
  51: "🌦 Мелкий дождь",
  53: "🌦 Дождь",
  55: "🌧 Сильный дождь",
  56: "🌧 Лёд. дождь",
  57: "🌧 Лёд. дождь",
  61: "🌦 Небольшой дождь",
  63: "🌧 Дождь",
  65: "🌧 Ливень",
  66: "🌧 Лёд. дождь",
  67: "🌧 Лёд. дождь",
  71: "🌨 Небольшой снег",
  73: "🌨 Снег",
  75: "❄️ Сильный снег",
  77: "❄️ Снежные зёрна",
  80: "🌦 Ливень",
  81: "🌧 Ливень",
  82: "⛈ Сильный ливень",
  85: "🌨 Снегопад",
  86: "❄️ Сильный снегопад",
  95: "⛈ Гроза",
  96: "⛈ Гроза с градом",
  99: "⛈ Гроза с градом",
};

function getWeatherDesc(code) {
  return weatherCodes[code] || "Код: " + code;
}

var dayNames = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

async function loadWeather() {
  try {
    var url =
      "https://api.open-meteo.com/v1/forecast?latitude=54.87&longitude=69.15" +
      "&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max" +
      "&timezone=Asia%2FAlmaty&forecast_days=3";
    var res = await fetch(url);
    var data = await res.json();

    // Current weather
    var c = data.current;
    var wBlock = document.getElementById("weatherBlock");
    wBlock.innerHTML =
      '<div style="font-size:20px;font-weight:800;margin-bottom:4px;">' +
      getWeatherDesc(c.weather_code) +
      "</div>" +
      "<div>🌡 <b>" +
      c.temperature_2m +
      "°C</b></div>" +
      "<div>💧 Влажность: " +
      c.relative_humidity_2m +
      "%</div>" +
      "<div>💨 Ветер: " +
      c.wind_speed_10m +
      " км/ч</div>";

    // 3-day forecast
    var d = data.daily;
    var fBlock = document.getElementById("forecastBlock");
    var html = "";
    for (var i = 0; i < d.time.length; i++) {
      var date = new Date(d.time[i] + "T00:00:00");
      var dayName = dayNames[date.getDay()];
      var dateStr =
        date.getDate() + "." + (date.getMonth() + 1 < 10 ? "0" : "") + (date.getMonth() + 1);
      html +=
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;' +
        (i < d.time.length - 1 ? "border-bottom:1px solid rgba(0,0,0,0.04);" : "") +
        '">' +
        "<div><b>" +
        dayName +
        '</b> <span style="opacity:0.7">' +
        dateStr +
        "</span></div>" +
        '<div style="text-align:right;">' +
        getWeatherDesc(d.weather_code[i]).split(" ")[0] +
        " <b>" +
        Math.round(d.temperature_2m_max[i]) +
        '°</b>/<span style="opacity:0.6">' +
        Math.round(d.temperature_2m_min[i]) +
        "°</span>" +
        "</div>" +
        "</div>";
    }
    fBlock.innerHTML = html;
  } catch (e) {
    console.warn("Ошибка загрузки погоды", e);
    document.getElementById("weatherBlock").textContent = "Не удалось загрузить";
    document.getElementById("forecastBlock").textContent = "Не удалось загрузить";
  }
}

loadWeather();
setInterval(loadWeather, 600000); // обновлять каждые 10 мин

// ==================== CHAT ====================
var sendBtn = document.getElementById("sendBtn");
var userInput = document.getElementById("userInput");
var chat = document.getElementById("chatContent");

sendBtn.addEventListener("click", sendMessage);
userInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter") sendMessage();
});

function quickSend(text) {
  userInput.value = text;
  sendMessage();
}

function appendUser(text) {
  var el = document.createElement("div");
  el.className = "msg-user";
  el.textContent = text;
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}

function parseMarkdown(text) {
  // Используем marked для конвертации маркдауна в HTML
  var html = marked.parse(text);
  // Убираем внешние <p> теги если они есть
  html = html.replace(/^<p>/, "").replace(/<\/p>$/, "");
  return html;
}

function appendBot(text) {
  var el = document.createElement("div");
  el.className = "msg-bot";
  el.innerHTML = parseMarkdown(text);
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}
function showTyping() {
  var el = document.createElement("div");
  el.className = "typing";
  el.id = "__typing__";
  el.innerHTML =
    '<div class="dot"></div><div class="dot"></div><div class="dot"></div><span class="label">Анализирую данные...</span>';
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
}
function hideTyping() {
  var t = document.getElementById("__typing__");
  if (t) t.remove();
}

function isDangerQuery(text) {
  text = text.toLowerCase();
  var patterns = [
    /покажи(.*)опасн/i,
    /покажи(.*)загрязн/i,
    /покажи(.*)вредн/i,
    /(показать|покажите)(.*)опасн/i,
    /(показать|покажите)(.*)загрязн/i,
    /опасн(ые|ых|ая|ое)?\s*(зон|точк|участ|район|мест)/i,
    /загрязн(ённ|енн|ые|ых)?\s*(зон|точк|участ|район|мест)/i,
    /где\s*(опасн|загрязн|грязн|вредн)/i,
    /где\s*(нельзя|не стоит)\s*(гулять|дышать|находиться)/i,
    /вредн(ые|ых)?\s*(зон|точк|участ|район|мест)/i,
    /грязн(ые|ых)?\s*(зон|точк|участ|район|мест)/i,
    /плох(ой|ая|ие|ое)?\s*(воздух|экологи)/i,
    /самы(е|й)\s*(грязн|опасн|загрязн)/i,
    /красн(ые|ых|ая)?\s*(зон|точк)/i,
    /экологическ(и|ая|ие)?\s*(опасн|вредн)/i,
  ];
  return patterns.some(function (r) {
    return r.test(text);
  });
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function sendMessage() {
  var text = userInput.value.trim();
  if (!text) return;
  appendUser(text);
  userInput.value = "";

  if (isDangerQuery(text)) {
    handleDangerRequest();
    return;
  }

  showTyping();

  try {
    const response = await fetch("/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: text }),
    });

    const data = await response.json();
    hideTyping();

    if (data.reply) {
      appendBot(data.reply);
    } else if (data.error) {
      appendBot("❌ Ошибка: " + data.error);
    } else {
      appendBot("❌ Неожиданный ответ сервера");
    }
  } catch (err) {
    hideTyping();
    appendBot("❌ Ошибка подключения: " + err.message);
  }
}

// ==================== DANGER ZONES ====================
var dangerPresets = [
  [
    { lat: 54.8455, lon: 69.1385, level: 135, name: "Промзона Юг" },
    { lat: 54.847, lon: 69.142, level: 128, name: "Промзона Юг" },
    { lat: 54.844, lon: 69.136, level: 142, name: "Промзона Юг" },
    { lat: 54.849, lon: 69.141, level: 118, name: "Промзона Юг" },
    { lat: 54.8753, lon: 69.163, level: 121, name: "ТЭЦ-2" },
    { lat: 54.876, lon: 69.165, level: 115, name: "ТЭЦ-2" },
    { lat: 54.8735, lon: 69.161, level: 130, name: "ТЭЦ-2" },
    { lat: 54.852, lon: 69.131, level: 140, name: "Заводской район" },
    { lat: 54.8535, lon: 69.128, level: 125, name: "Заводской район" },
    { lat: 54.851, lon: 69.134, level: 133, name: "Заводской район" },
  ],
  [
    { lat: 54.871, lon: 69.151, level: 112, name: "Автовокзал" },
    { lat: 54.872, lon: 69.153, level: 119, name: "Автовокзал" },
    { lat: 54.868, lon: 69.172, level: 126, name: "Ж/д вокзал" },
    { lat: 54.869, lon: 69.17, level: 131, name: "Ж/д вокзал" },
    { lat: 54.867, lon: 69.174, level: 117, name: "Ж/д вокзал" },
    { lat: 54.874, lon: 69.156, level: 123, name: "Центр" },
    { lat: 54.87, lon: 69.149, level: 138, name: "Центр" },
    { lat: 54.8665, lon: 69.168, level: 144, name: "Центр" },
    { lat: 54.8725, lon: 69.158, level: 110, name: "Центр" },
    { lat: 54.8695, lon: 69.166, level: 127, name: "Центр" },
  ],
  [
    { lat: 54.852, lon: 69.13, level: 148, name: "Заводской район" },
    { lat: 54.854, lon: 69.132, level: 137, name: "Заводской район" },
    { lat: 54.85, lon: 69.128, level: 141, name: "Заводской район" },
    { lat: 54.853, lon: 69.126, level: 129, name: "Заводской район" },
    { lat: 54.856, lon: 69.134, level: 133, name: "Заводской район" },
    { lat: 54.851, lon: 69.135, level: 145, name: "Заводской район" },
    { lat: 54.855, lon: 69.129, level: 122, name: "Заводской район" },
    { lat: 54.848, lon: 69.131, level: 139, name: "Заводской район" },
    { lat: 54.8535, lon: 69.137, level: 116, name: "Заводской район" },
    { lat: 54.8495, lon: 69.125, level: 150, name: "Заводской район" },
  ],
  [
    { lat: 54.86, lon: 69.18, level: 114, name: "Мкрн Береке" },
    { lat: 54.862, lon: 69.182, level: 127, name: "Мкрн Береке" },
    { lat: 54.858, lon: 69.178, level: 131, name: "Мкрн Береке" },
    { lat: 54.861, lon: 69.185, level: 119, name: "Мкрн Береке" },
    { lat: 54.864, lon: 69.179, level: 136, name: "Восток" },
    { lat: 54.859, lon: 69.183, level: 143, name: "Восток" },
    { lat: 54.857, lon: 69.176, level: 112, name: "Восток" },
    { lat: 54.863, lon: 69.187, level: 125, name: "Восток" },
    { lat: 54.856, lon: 69.181, level: 138, name: "Восток" },
    { lat: 54.865, lon: 69.184, level: 120, name: "Восток" },
  ],
  [
    { lat: 54.89, lon: 69.155, level: 118, name: "Север" },
    { lat: 54.892, lon: 69.153, level: 124, name: "Север" },
    { lat: 54.888, lon: 69.158, level: 131, name: "Частный сектор" },
    { lat: 54.894, lon: 69.151, level: 116, name: "Частный сектор" },
    { lat: 54.891, lon: 69.16, level: 142, name: "Частный сектор" },
    { lat: 54.887, lon: 69.149, level: 137, name: "Север" },
    { lat: 54.8935, lon: 69.157, level: 128, name: "Север" },
    { lat: 54.8895, lon: 69.154, level: 145, name: "Частный сектор" },
    { lat: 54.886, lon: 69.162, level: 113, name: "Север" },
    { lat: 54.895, lon: 69.148, level: 121, name: "Север" },
  ],
  [
    { lat: 54.84, lon: 69.145, level: 149, name: "Южные окраины" },
    { lat: 54.842, lon: 69.143, level: 138, name: "Южные окраины" },
    { lat: 54.838, lon: 69.147, level: 142, name: "Свалка" },
    { lat: 54.841, lon: 69.15, level: 127, name: "Свалка" },
    { lat: 54.844, lon: 69.148, level: 133, name: "Южные окраины" },
    { lat: 54.836, lon: 69.144, level: 150, name: "Свалка" },
    { lat: 54.843, lon: 69.152, level: 119, name: "Южные окраины" },
    { lat: 54.839, lon: 69.141, level: 144, name: "Свалка" },
    { lat: 54.837, lon: 69.149, level: 136, name: "Южные окраины" },
    { lat: 54.845, lon: 69.146, level: 125, name: "Южные окраины" },
  ],
  [
    { lat: 54.87, lon: 69.14, level: 121, name: "Трасса M-39" },
    { lat: 54.868, lon: 69.145, level: 129, name: "Трасса M-39" },
    { lat: 54.866, lon: 69.15, level: 117, name: "Трасса M-39" },
    { lat: 54.864, lon: 69.155, level: 134, name: "Трасса M-39" },
    { lat: 54.862, lon: 69.16, level: 126, name: "Трасса M-39" },
    { lat: 54.86, lon: 69.165, level: 140, name: "Трасса M-39" },
    { lat: 54.858, lon: 69.17, level: 113, name: "Трасса M-39" },
    { lat: 54.856, lon: 69.175, level: 137, name: "Трасса M-39" },
    { lat: 54.872, lon: 69.135, level: 145, name: "Трасса M-39" },
    { lat: 54.854, lon: 69.18, level: 122, name: "Трасса M-39" },
  ],
  [
    { lat: 54.875, lon: 69.12, level: 132, name: "Запад промышленный" },
    { lat: 54.877, lon: 69.122, level: 126, name: "Запад промышленный" },
    { lat: 54.873, lon: 69.118, level: 141, name: "Запад промышленный" },
    { lat: 54.879, lon: 69.124, level: 118, name: "Запад промышленный" },
    { lat: 54.871, lon: 69.116, level: 147, name: "Запад промышленный" },
    { lat: 54.876, lon: 69.125, level: 123, name: "Запад промышленный" },
    { lat: 54.874, lon: 69.119, level: 135, name: "Запад промышленный" },
    { lat: 54.88, lon: 69.121, level: 129, name: "Запад промышленный" },
    { lat: 54.872, lon: 69.117, level: 143, name: "Запад промышленный" },
    { lat: 54.878, lon: 69.126, level: 114, name: "Запад промышленный" },
  ],
  [
    { lat: 54.874, lon: 69.158, level: 119, name: "Рынок" },
    { lat: 54.8755, lon: 69.16, level: 128, name: "Рынок" },
    { lat: 54.873, lon: 69.156, level: 136, name: "Рынок" },
    { lat: 54.877, lon: 69.162, level: 112, name: "Центральный перекрёсток" },
    { lat: 54.872, lon: 69.154, level: 143, name: "Центральный перекрёсток" },
    { lat: 54.876, lon: 69.164, level: 131, name: "Центральный перекрёсток" },
    { lat: 54.8745, lon: 69.157, level: 124, name: "Рынок" },
    { lat: 54.8735, lon: 69.161, level: 148, name: "Рынок" },
    { lat: 54.8715, lon: 69.155, level: 117, name: "Центральный перекрёсток" },
    { lat: 54.878, lon: 69.159, level: 139, name: "Центральный перекрёсток" },
  ],
  [
    { lat: 54.846, lon: 69.139, level: 134, name: "Промзона Юг" },
    { lat: 54.875, lon: 69.162, level: 121, name: "ТЭЦ-2" },
    { lat: 54.861, lon: 69.181, level: 128, name: "Мкрн Береке" },
    { lat: 54.852, lon: 69.131, level: 146, name: "Заводской район" },
    { lat: 54.869, lon: 69.171, level: 115, name: "Ж/д вокзал" },
    { lat: 54.843, lon: 69.145, level: 139, name: "Южные окраины" },
    { lat: 54.877, lon: 69.159, level: 127, name: "Центр" },
    { lat: 54.858, lon: 69.177, level: 142, name: "Восток" },
    { lat: 54.85, lon: 69.135, level: 118, name: "Заводской район" },
    { lat: 54.866, lon: 69.168, level: 136, name: "Центр" },
  ],
];

async function handleDangerRequest() {
  // Remove previous danger markers
  dangerMarkers.forEach(function (m) {
    map.removeLayer(m);
  });
  dangerMarkers = [];

  // Try to get danger points from loaded data
  var points = [];
  try {
    if (!lastPollutionResults) await updatePollutionData();
    var results = lastPollutionResults || [];
    results.forEach(function (loc) {
      if (!loc.coordinates) return;
      var level = 0;
      loc.measurements.forEach(function (m) {
        if (m.parameter === "pm25") level = m.value;
      });
      if (level > 100) {
        points.push({
          lat: loc.coordinates.latitude,
          lon: loc.coordinates.longitude,
          level: level,
          name: loc.zoneName || "Неизвестный район",
        });
      }
    });
  } catch (e) {}

  // Fallback: random preset
  if (points.length === 0) {
    var preset = dangerPresets[Math.floor(Math.random() * dangerPresets.length)];
    preset.forEach(function (p) {
      points.push({
        lat: p.lat + (Math.random() - 0.5) * 0.003,
        lon: p.lon + (Math.random() - 0.5) * 0.003,
        level: p.level + Math.floor((Math.random() - 0.5) * 10),
        name: p.name,
      });
    });
  }

  // Step 1: Show typing — AI "thinking"
  showTyping();

  // Step 2: After 1.5s, remove typing, show first message, start placing markers one by one
  var thinkTime = 1500 + Math.floor(Math.random() * 800);
  setTimeout(function () {
    hideTyping();
    appendBot("🔎 Анализирую экологические данные по Петропавловску...");

    var idx = 0;
    var interval = setInterval(function () {
      if (idx >= points.length) {
        clearInterval(interval);
        // Final message
        setTimeout(function () {
          appendBot(
            "✅ Готово — найдено <b>" +
              points.length +
              "</b> опасных участков. Нажмите на метки для подробностей.",
          );
          // Update sidebar danger count
          document.getElementById("statDanger").textContent = points.length;
        }, 500);
        return;
      }
      addDangerMarker(points[idx]);
      idx++;
    }, 1000);
  }, thinkTime);
}

function addDangerMarker(pt) {
  var color = "#e53e3e";
  var popup =
    "<b>🔴 Опасная зона — загрязнение воздуха</b>" +
    "<br>📍 " +
    pt.name +
    "<br>PM2.5: <b>" +
    pt.level +
    "</b> мкг/м³" +
    '<br><span style="color:#e53e3e">⚠️ Превышение экологической нормы</span>';
  var m = L.circleMarker([pt.lat, pt.lon], {
    radius: 2,
    color: color,
    fillColor: color,
    fillOpacity: 0.9,
    weight: 2,
  }).bindPopup(popup);
  m.addTo(map);
  dangerMarkers.push(m);

  // Animate: grow radius from 2 to 10
  var r = 2;
  var grow = setInterval(function () {
    r += 2;
    m.setRadius(r);
    if (r >= 10) clearInterval(grow);
  }, 80);

  // Add to heatmap
  try {
    var current = heatLayer.getLatLngs ? heatLayer.getLatLngs() : [];
    var newArr = (current || []).slice();
    newArr.push([pt.lat, pt.lon, Math.min(pt.level / 150, 1)]);
    heatLayer.setLatLngs(newArr);
  } catch (e) {}
}
