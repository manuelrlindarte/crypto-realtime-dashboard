/**
 * Dashboard 2 — herramienta propia con código
 * Fuente: Binance WebSocket (trades en tiempo real)
 * Stream: wss://stream.binance.com:9443/ws/<symbol>@trade
 */

// ====== ELEMENTOS UI (Módulo 1) ======
const statusEl = document.getElementById("status");
const nowEl = document.getElementById("now");
const lastEl = document.getElementById("lastUpdate");
const countEl = document.getElementById("msgCount");

const contexto1 = document.getElementById("contexto1");
const contexto2 = document.getElementById("contexto2");

const menu = document.getElementById("menuMonedas");

// Reloj (evidencia de “tiempo real”)
function formatTime(d) {
  return d.toLocaleTimeString();
}
setInterval(() => {
  nowEl.textContent = formatTime(new Date());
}, 500);

// Formato moneda (USDT ~ USD)
const formatoUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

// ====== DATA MODEL ======
const MAX_POINTS = 60;
let msgCount = 0;
let series = []; // [{time: Date, price: Number}]
let currentSymbol = menu.value; // ejemplo: btcusdt

function resetSeries() {
  series = [];
  msgCount = 0;
  countEl.textContent = "0";
  lastEl.textContent = "--:--:--";
  contexto1.textContent = "";
  contexto2.textContent = "";
}

// ====== WEBSOCKET (Binance) ======
let ws = null;

// Esto evita que un WS viejo pise el estado del WS nuevo
let connectionId = 0;

// Para evidenciar “en vivo”: si pasan X segundos sin mensajes, marcamos como inactivo
let lastMessageAt = 0;
const LIVE_TIMEOUT_MS = 5000;

function setStatus(text) {
  statusEl.textContent = text;
}

function connectWS(symbol) {
  connectionId += 1;
  const myId = connectionId;

  // Cierra el WS anterior (si existe)
  if (ws) {
    try { ws.close(); } catch (e) { }
  }

  setStatus("Conectando...");
  lastMessageAt = 0;

  const url = `wss://stream.binance.com:9443/ws/${symbol}@trade`;
  ws = new WebSocket(url);

  ws.onopen = () => {
    if (myId !== connectionId) return; // ignora conexiones viejas
    setStatus("En vivo ✅");
  };

  ws.onmessage = (event) => {
    if (myId !== connectionId) return; // ignora conexiones viejas

    const data = JSON.parse(event.data);

    // En @trade, el precio viene en "p" como string
    if (data && data.p) {
      const price = Number(data.p);
      if (!Number.isFinite(price)) return;

      lastMessageAt = Date.now();

      series.push({ time: new Date(), price });
      if (series.length > MAX_POINTS) series.shift();

      msgCount += 1;
      countEl.textContent = String(msgCount);
      lastEl.textContent = formatTime(new Date());

      updateText(price);
      drawChart(series);
    }
  };

  ws.onerror = () => {
    if (myId !== connectionId) return;
    setStatus("Error de conexión ❌");
  };

  ws.onclose = () => {
    // IMPORTANTÍSIMO: solo la conexión actual puede cambiar el estado
    if (myId !== connectionId) return;
    setStatus("Desconectado");
  };
}

// Monitor simple: si no llegan mensajes por un rato, marcamos “Desconectado”
setInterval(() => {
  // Solo si ya estaba “En vivo ✅”
  if (statusEl.textContent === "En vivo ✅") {
    if (lastMessageAt && Date.now() - lastMessageAt > LIVE_TIMEOUT_MS) {
      setStatus("Desconectado");
    }
  }
}, 1000);

// ====== TEXTOS DINÁMICOS ======
function symbolPretty(symbol) {
  // btcusdt -> BTC/USDT
  const up = symbol.toUpperCase();
  return up.replace("USDT", "/USDT");
}

function updateText(currentPrice) {
  contexto1.innerText = `- ${symbolPretty(currentSymbol)}: ${formatoUSD.format(currentPrice)} (≈ USDT)`;

  if (series.length < 2) {
    contexto2.innerText = "Esperando más datos para comparar…";
    return;
  }

  const initialPrice = series[0].price;
  const diff = currentPrice - initialPrice;

  if (diff > 0) {
    contexto2.innerText = `En esta ventana temporal, el precio subió + ${formatoUSD.format(diff)}`;
  } else if (diff < 0) {
    contexto2.innerText = `En esta ventana temporal, el precio bajó - ${formatoUSD.format(Math.abs(diff))}`;
  } else {
    contexto2.innerText = "En esta ventana temporal, el precio no cambió (≈ 0)";
  }
}

// ====== D3 LINE CHART (Módulo 2) ======
const margin = { top: 10, right: 20, bottom: 45, left: 70 };
const width = 760 - margin.left - margin.right;
const height = 320 - margin.top - margin.bottom;

const svg = d3
  .select("#chart")
  .append("svg")
  .attr("width", width + margin.left + margin.right)
  .attr("height", height + margin.top + margin.bottom)
  .append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);

const x = d3.scaleTime().range([0, width]);
const y = d3.scaleLinear().range([height, 0]);

const xAxis = svg.append("g").attr("transform", `translate(0,${height})`);
const yAxis = svg.append("g");

// Etiquetas discretas de ejes (sin recargar)
svg
  .append("text")
  .attr("class", "axis-label")
  .attr("x", width / 2)
  .attr("y", height + 36)
  .attr("text-anchor", "middle")
  .text("Hora");

svg
  .append("text")
  .attr("class", "axis-label")
  .attr("transform", "rotate(-90)")
  .attr("x", -height / 2)
  .attr("y", -50)
  .attr("text-anchor", "middle")
  .text("Precio (USDT)");

const line = d3
  .line()
  .x((d) => x(d.time))
  .y((d) => y(d.price));

const path = svg
  .append("path")
  .attr("fill", "none")
  .attr("stroke-width", 2.5)
  .attr("class", "linea neutral");

function setLineClassByTrend(data) {
  if (!data || data.length < 2) return;

  const first = data[0].price;
  const last = data[data.length - 1].price;

  path
    .classed("up", last > first)
    .classed("down", last < first)
    .classed("neutral", last === first);
}

function drawChart(data) {
  if (!data || data.length < 2) return;

  x.domain(d3.extent(data, (d) => d.time));

  const minY = d3.min(data, (d) => d.price);
  const maxY = d3.max(data, (d) => d.price);
  const padding = (maxY - minY) * 0.05 || 1;
  y.domain([minY - padding, maxY + padding]);

  xAxis.call(d3.axisBottom(x).ticks(6));
  yAxis.call(d3.axisLeft(y).ticks(6));

  path.datum(data).attr("d", line);

  // Color según tendencia en la ventana temporal
  setLineClassByTrend(data);
}

// ====== MENÚ ======
menu.addEventListener("change", (e) => {
  currentSymbol = e.target.value;
  resetSeries();
  connectWS(currentSymbol);
});

// ARRANQUE
resetSeries();
connectWS(currentSymbol);