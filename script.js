import { FFmpeg } from "./ffmpeg-lib/index.js";
import { fetchFile } from "https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js";

const el = (id) => document.getElementById(id);

const fileEl = el("file");
const fpsEl = el("fps");
const fpsValEl = el("fpsVal");
const maxWEl = el("maxW");
const ditherEl = el("dither");
const loopEl = el("loop");

const loadBtn = el("loadBtn");
const convertBtn = el("convertBtn");
const resetBtn = el("resetBtn");
const statusEl = el("status");
const progFill = el("progFill");

const inNameEl = el("inName");
const outNameEl = el("outName");
const mp4SizeEl = el("mp4Size");
const durEl = el("dur");
const resEl = el("res");
const estEl = el("est");
const estHintEl = el("estHint");
const gifSizeEl = el("gifSize");

const downloadEl = el("download");
const previewWrap = el("previewWrap");
const previewEl = el("preview");

const ffmpeg = new FFmpeg();
let engineLoaded = false;
let selectedFile = null;
let meta = { duration: null, width: null, height: null };

const fmtBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
};

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const setStatus = (txt, tone = "muted") => {
  statusEl.className = `status ${tone}`;
  statusEl.textContent = txt;
};

const setProgress = (p) => {
  const v = clamp(Math.round(p * 100), 0, 100);
  progFill.style.width = `${v}%`;
};

const parseMetaFromLog = (log) => {
  const durMatch = log.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (durMatch) {
    const h = Number(durMatch[1]);
    const m = Number(durMatch[2]);
    const s = Number(durMatch[3]);
    meta.duration = h * 3600 + m * 60 + s;
  }
  const videoLine = log.split("\n").find((l) => l.includes("Video:"));
  if (videoLine) {
    const resMatch = videoLine.match(/,\s*(\d{2,5})x(\d{2,5})[,\s]/);
    if (resMatch) {
      meta.width = Number(resMatch[1]);
      meta.height = Number(resMatch[2]);
    }
  }
};

const fmtTime = (sec) => {
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m ${r}s`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
};

const updateEstimate = () => {
  if (
    !selectedFile ||
    !Number.isFinite(meta.duration) ||
    !Number.isFinite(meta.width) ||
    !Number.isFinite(meta.height)
  ) {
    estEl.textContent = "—";
    estHintEl.textContent = "";
    return;
  }

  const fps = Number(fpsEl.value);
  const maxW = Number(maxWEl.value || 0);

  let w = meta.width;
  let h = meta.height;

  if (Number.isFinite(maxW) && maxW > 0 && w > maxW) {
    const ratio = maxW / w;
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const frames = meta.duration * fps;
  const pixels = w * h;
  const motionFactor = 0.22;
  const bytesPerFrame = Math.max(400, (pixels * motionFactor) / 8);
  const overhead = 160 * 1024;
  const est = frames * bytesPerFrame + overhead;

  const hintParts = [];
  hintParts.push(`Baseado em duração × FPS e resolução.`);
  if (maxW > 0 && meta.width > maxW) hintParts.push(`Redimensionado para ~${w}×${h}.`);
  hintParts.push(`Pode variar com movimento e detalhes.`);

  estEl.textContent = fmtBytes(est);
  estHintEl.textContent = hintParts.join(" ");
};

const updateUiFile = () => {
  if (!selectedFile) {
    inNameEl.textContent = "—";
    mp4SizeEl.textContent = "—";
    durEl.textContent = "—";
    resEl.textContent = "—";
    estEl.textContent = "—";
    estHintEl.textContent = "";
    gifSizeEl.textContent = "—";
    outNameEl.textContent = "—";
    downloadEl.style.display = "none";
    previewWrap.style.display = "none";
    previewEl.src = "";
    return;
  }
  inNameEl.textContent = selectedFile.name;
  mp4SizeEl.textContent = fmtBytes(selectedFile.size);
  durEl.textContent = fmtTime(meta.duration);
  resEl.textContent =
    Number.isFinite(meta.width) && Number.isFinite(meta.height) ? `${meta.width}×${meta.height}` : "—";
  updateEstimate();
};

const resetAll = async () => {
  selectedFile = null;
  meta = { duration: null, width: null, height: null };
  fileEl.value = "";
  setProgress(0);
  setStatus("Selecione um MP4 para começar.");
  updateUiFile();
  convertBtn.disabled = true;
  resetBtn.disabled = true;
  downloadEl.style.display = "none";
  previewWrap.style.display = "none";
};

fpsEl.addEventListener("input", () => {
  fpsValEl.textContent = fpsEl.value;
  updateEstimate();
});

maxWEl.addEventListener("input", updateEstimate);

fileEl.addEventListener("change", (e) => {
  selectedFile = e.target.files?.[0] || null;
  meta = { duration: null, width: null, height: null };
  setProgress(0);
  downloadEl.style.display = "none";
  previewWrap.style.display = "none";
  previewEl.src = "";
  outNameEl.textContent = "—";
  gifSizeEl.textContent = "—";
  resetBtn.disabled = !selectedFile;
  loadBtn.disabled = false;
  convertBtn.disabled = true;
  setStatus(selectedFile ? "Arquivo selecionado. Clique em “Carregar motor”." : "Selecione um MP4 para começar.", selectedFile ? "warn" : "muted");
  updateUiFile();
});

const tryLoad = async () => {
  const coreURL = new URL(`ffmpeg/ffmpeg-core.js`, location.href).toString();
  const wasmURL = new URL(`ffmpeg/ffmpeg-core.wasm`, location.href).toString();
  await ffmpeg.load({ coreURL, wasmURL });
};

loadBtn.addEventListener("click", async () => {
  if (engineLoaded) return;

  try {
    loadBtn.disabled = true;
    setStatus("Carregando motor de conversão (FFmpeg)...", "warn");
    setProgress(0);

    ffmpeg.on("progress", ({ progress }) => setProgress(progress));

    await tryLoad();

    engineLoaded = true;
    loadBtn.textContent = "Motor carregado";
    setStatus("Motor carregado. Pronto para converter.", "ok");
    convertBtn.disabled = !selectedFile;
  } catch (e) {
    engineLoaded = false;
    loadBtn.disabled = false;
    setStatus("Falha ao carregar o motor. Garanta /ffmpeg com ffmpeg-core.js e ffmpeg-core.wasm, e /ffmpeg-lib com o pacote ESM.", "err");
    console.error(e);
  }
});

const extractMeta = async () => {
  meta = { duration: null, width: null, height: null };
  const inName = "input.mp4";
  await ffmpeg.writeFile(inName, await fetchFile(selectedFile));

  let captured = "";
  const logHandler = ({ message }) => {
    captured += message + "\n";
  };
  ffmpeg.on("log", logHandler);
  try {
    await ffmpeg.exec(["-hide_banner", "-i", inName]);
  } catch (e) {
  } finally {
    ffmpeg.off("log", logHandler);
  }

  parseMetaFromLog(captured);
  updateUiFile();
};

const buildFilters = () => {
  const fps = Number(fpsEl.value);
  const maxW = Number(maxWEl.value || 0);
  const scalePart = Number.isFinite(maxW) && maxW > 0 ? `scale='min(iw,${maxW})':-2:flags=lanczos` : "scale=iw:ih:flags=lanczos";
  return `fps=${fps},${scalePart}`;
};

const convert = async () => {
  if (!engineLoaded) {
    setStatus("Carregue o motor primeiro.", "warn");
    return;
  }
  if (!selectedFile) {
    setStatus("Selecione um MP4 primeiro.", "warn");
    return;
  }

  convertBtn.disabled = true;
  loadBtn.disabled = true;
  resetBtn.disabled = true;
  downloadEl.style.display = "none";
  previewWrap.style.display = "none";
  previewEl.src = "";
  gifSizeEl.textContent = "—";
  outNameEl.textContent = "—";
  setProgress(0);

  try {
    setStatus("Lendo metadados do vídeo...", "warn");
    await extractMeta();

    const inName = "input.mp4";
    const paletteName = "palette.png";
    const outGif = "output.gif";

    const vf = buildFilters();
    const dither = ditherEl.value;
    const loop = loopEl.value;

    setStatus("Gerando paleta (qualidade alta)...", "warn");
    setProgress(0);
    await ffmpeg.exec(["-hide_banner", "-i", inName, "-vf", `${vf},palettegen=stats_mode=diff`, paletteName]);

    setStatus("Convertendo para GIF...", "warn");
    setProgress(0);
    const useFilter = `[0:v]${vf}[x];[x][1:v]paletteuse=dither=${dither}:diff_mode=rectangle`;
    await ffmpeg.exec(["-hide_banner", "-i", inName, "-i", paletteName, "-lavfi", useFilter, "-loop", loop, outGif]);

    const data = await ffmpeg.readFile(outGif);
    const blob = new Blob([data.buffer], { type: "image/gif" });
    const url = URL.createObjectURL(blob);

    outNameEl.textContent = "convertido.gif";
    gifSizeEl.textContent = fmtBytes(blob.size);

    downloadEl.href = url;
    downloadEl.download = "convertido.gif";
    downloadEl.style.display = "inline-flex";

    previewEl.src = url;
    previewWrap.style.display = "block";

    setStatus("Pronto. Clique em “Baixar GIF”.", "ok");
    setProgress(1);
  } catch (e) {
    setStatus("Erro na conversão. Tente reduzir FPS e/ou definir largura máxima.", "err");
    console.error(e);
    setProgress(0);
  } finally {
    loadBtn.disabled = false;
    resetBtn.disabled = false;
    convertBtn.disabled = !(selectedFile && engineLoaded);
  }
};

convertBtn.addEventListener("click", convert);
resetBtn.addEventListener("click", resetAll);

fpsValEl.textContent = fpsEl.value;
loadBtn.disabled = false;
setStatus("Selecione um MP4 para começar.");
