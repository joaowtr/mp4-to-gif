import { FFmpeg } from "./ffmpeg-lib/index.js";
import { fetchFile } from "https://unpkg.com/@ffmpeg/util@0.12.1/dist/esm/index.js";

const el = (id) => document.getElementById(id);

const fileEl = el("file");
const fpsEl = el("fps");
const fpsValEl = el("fpsVal");
const maxWEl = el("maxW");
const ditherEl = el("dither");
const loopEl = el("loop");
const maxColorsEl = el("maxColors");
const maxColorsValEl = el("maxColorsVal");
const optPresetEl = el("optPreset");

const loadBtn = el("loadBtn");
const autoBtn = el("autoBtn");
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

const getMaxColors = () => {
  const v = Number(maxColorsEl.value);
  if (!Number.isFinite(v)) return 128;
  return clamp(Math.round(v), 32, 256);
};

const syncPresetFromSlider = () => {
  const v = String(getMaxColors());
  const presetVals = new Set(["256", "192", "128", "96", "64"]);
  optPresetEl.value = presetVals.has(v) ? v : "custom";
};

const applyPreset = (val) => {
  if (val === "custom") return;
  const n = clamp(Number(val), 32, 256);
  maxColorsEl.value = String(n);
  maxColorsValEl.textContent = String(n);
  updateEstimate();
};

const readVideoMeta = async () => {
  if (!selectedFile) return;
  const url = URL.createObjectURL(selectedFile);
  const v = document.createElement("video");
  v.preload = "metadata";
  v.muted = true;
  await new Promise((resolve) => {
    v.onloadedmetadata = () => resolve();
    v.onerror = () => resolve();
    v.src = url;
  });
  URL.revokeObjectURL(url);
  if (Number.isFinite(v.duration)) meta.duration = v.duration;
  if (Number.isFinite(v.videoWidth) && Number.isFinite(v.videoHeight) && v.videoWidth > 0 && v.videoHeight > 0) {
    meta.width = v.videoWidth;
    meta.height = v.videoHeight;
  }
};

const estimateBytes = (fps, maxW, maxColors, dither) => {
  if (!selectedFile || !Number.isFinite(meta.duration) || !Number.isFinite(meta.width) || !Number.isFinite(meta.height)) return Infinity;

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
  const ditherFactor = dither === "none" ? 0.88 : 1.0;
  const colorFactor = Math.pow(maxColors / 256, 0.85);

  const bytesPerFrame = Math.max(320, (pixels * motionFactor * ditherFactor * colorFactor) / 8);
  const overhead = 160 * 1024;

  return frames * bytesPerFrame + overhead;
};

const updateEstimate = () => {
  if (!selectedFile || !Number.isFinite(meta.duration) || !Number.isFinite(meta.width) || !Number.isFinite(meta.height)) {
    estEl.textContent = "—";
    estHintEl.textContent = "";
    return;
  }

  const fps = Number(fpsEl.value);
  const maxW = Number(maxWEl.value || 0);
  const maxColors = getMaxColors();
  const dither = ditherEl.value;

  const est = estimateBytes(fps, maxW, maxColors, dither);

  let w = meta.width;
  let h = meta.height;
  if (Number.isFinite(maxW) && maxW > 0 && w > maxW) {
    const ratio = maxW / w;
    w = Math.round(w * ratio);
    h = Math.round(h * ratio);
  }

  const hintParts = [];
  hintParts.push(`Duração × FPS, resolução e ${maxColors} cores.`);
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
  resEl.textContent = Number.isFinite(meta.width) && Number.isFinite(meta.height) ? `${meta.width}×${meta.height}` : "—";
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
  autoBtn.disabled = true;
  downloadEl.style.display = "none";
  previewWrap.style.display = "none";
};

fpsEl.addEventListener("input", () => {
  fpsValEl.textContent = fpsEl.value;
  updateEstimate();
});

maxWEl.addEventListener("input", updateEstimate);

maxColorsEl.addEventListener("input", () => {
  maxColorsValEl.textContent = String(getMaxColors());
  syncPresetFromSlider();
  updateEstimate();
});

optPresetEl.addEventListener("change", () => applyPreset(optPresetEl.value));

fileEl.addEventListener("change", async (e) => {
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
  autoBtn.disabled = !selectedFile;
  convertBtn.disabled = true;
  setStatus(selectedFile ? "Arquivo selecionado. Clique em “Carregar motor”." : "Selecione um MP4 para começar.", selectedFile ? "warn" : "muted");
  if (selectedFile) await readVideoMeta();
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
    setStatus("Falha ao carregar o motor. Garanta /ffmpeg com ffmpeg-core.js e ffmpeg-core.wasm, e /ffmpeg-lib no site.", "err");
    console.error(e);
  }
});

const autoOptimize = async () => {
  if (!selectedFile) {
    setStatus("Selecione um MP4 primeiro.", "warn");
    return;
  }

  if (!Number.isFinite(meta.duration) || !Number.isFinite(meta.width) || !Number.isFinite(meta.height)) {
    await readVideoMeta();
    updateUiFile();
  }

  if (!Number.isFinite(meta.duration) || !Number.isFinite(meta.width) || !Number.isFinite(meta.height)) {
    setStatus("Não consegui ler duração/resolução desse vídeo.", "err");
    return;
  }

  const mp4MB = selectedFile.size / (1024 * 1024);
  const targetMB = mp4MB <= 8 ? 15 : mp4MB <= 20 ? 25 : 35;
  const targetBytes = targetMB * 1024 * 1024;

  const fpsCandidates = [20, 18, 15, 12, 10, 8];
  const widthCandidates = meta.width >= 1200 ? [720, 640, 560, 480, 400] : meta.width >= 900 ? [720, 640, 480, 400] : [0, 720, 640, 480, 400];
  const colorCandidates = [128, 96, 64];
  const ditherCandidates = ["bayer:bayer_scale=2", "sierra2_4a", "none"];

  let best = null;

  for (const fps of fpsCandidates) {
    for (const maxW of widthCandidates) {
      for (const colors of colorCandidates) {
        for (const dither of ditherCandidates) {
          const est = estimateBytes(fps, maxW, colors, dither);
          if (!Number.isFinite(est)) continue;

          const qualityScore =
            (fps >= 15 ? 3 : fps >= 12 ? 2 : 1) +
            (colors >= 128 ? 3 : colors >= 96 ? 2 : 1) +
            (maxW === 0 ? 3 : maxW >= 640 ? 2 : 1) +
            (dither === "none" ? 0 : 1);

          const candidate = { fps, maxW, colors, dither, est, qualityScore };

          if (est <= targetBytes) {
            if (!best) best = candidate;
            else if (candidate.qualityScore > best.qualityScore) best = candidate;
            else if (candidate.qualityScore === best.qualityScore && candidate.est < best.est) best = candidate;
          } else if (!best) {
            best = candidate;
          } else if (best.est > targetBytes && candidate.est < best.est) {
            best = candidate;
          }
        }
      }
    }
  }

  if (!best) {
    setStatus("Não consegui gerar uma sugestão automática.", "err");
    return;
  }

  fpsEl.value = String(best.fps);
  fpsValEl.textContent = String(best.fps);
  maxWEl.value = String(best.maxW);
  maxColorsEl.value = String(best.colors);
  maxColorsValEl.textContent = String(best.colors);
  syncPresetFromSlider();
  ditherEl.value = best.dither;

  updateEstimate();
  setStatus(`Auto otimizado: ${best.fps} FPS, ${best.maxW === 0 ? "largura original" : `máx ${best.maxW}px`}, ${best.colors} cores, dithering ${best.dither === "none" ? "off" : "on"}.`, "ok");
};

autoBtn.addEventListener("click", autoOptimize);

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
  autoBtn.disabled = true;
  resetBtn.disabled = true;
  downloadEl.style.display = "none";
  previewWrap.style.display = "none";
  previewEl.src = "";
  gifSizeEl.textContent = "—";
  outNameEl.textContent = "—";
  setProgress(0);

  try {
    if (!Number.isFinite(meta.duration) || !Number.isFinite(meta.width) || !Number.isFinite(meta.height)) {
      await readVideoMeta();
      updateUiFile();
    }

    const inName = "input.mp4";
    const paletteName = "palette.png";
    const outGif = "output.gif";

    const vf = buildFilters();
    const dither = ditherEl.value;
    const loop = loopEl.value;
    const maxColors = getMaxColors();

    setStatus(`Preparando arquivo...`, "warn");
    await ffmpeg.writeFile(inName, await fetchFile(selectedFile));

    setStatus(`Gerando paleta (${maxColors} cores)...`, "warn");
    setProgress(0);
    await ffmpeg.exec(["-hide_banner","-i",inName,"-vf",`${vf},palettegen=max_colors=${maxColors}:stats_mode=diff`,paletteName]);

    setStatus("Convertendo para GIF...", "warn");
    setProgress(0);
    const useFilter = `[0:v]${vf}[x];[x][1:v]paletteuse=dither=${dither}:diff_mode=rectangle`;
    await ffmpeg.exec(["-hide_banner","-i",inName,"-i",paletteName,"-lavfi",useFilter,"-loop",loop,outGif]);

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
    setStatus("Erro na conversão. Tente reduzir FPS e/ou largura e/ou cores.", "err");
    console.error(e);
    setProgress(0);
  } finally {
    loadBtn.disabled = false;
    autoBtn.disabled = !selectedFile;
    resetBtn.disabled = false;
    convertBtn.disabled = !(selectedFile && engineLoaded);
  }
};

convertBtn.addEventListener("click", convert);
resetBtn.addEventListener("click", resetAll);

fpsValEl.textContent = fpsEl.value;
maxColorsValEl.textContent = String(getMaxColors());
syncPresetFromSlider();
loadBtn.disabled = false;
autoBtn.disabled = true;
setStatus("Selecione um MP4 para começar.");
