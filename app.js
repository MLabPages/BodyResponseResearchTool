const els = {
  consentPanel: document.getElementById("consentPanel"),
  consentCheck: document.getElementById("consentCheck"),
  consentButton: document.getElementById("consentButton"),
  video: document.getElementById("video"),
  overlay: document.getElementById("overlay"),
  sample: document.getElementById("sampleCanvas"),
  chart: document.getElementById("chart"),
  permissionPanel: document.getElementById("permissionPanel"),
  startButton: document.getElementById("startButton"),
  stopCameraButton: document.getElementById("stopCameraButton"),
  recordButton: document.getElementById("recordButton"),
  baselineButton: document.getElementById("baselineButton"),
  resetBaselineButton: document.getElementById("resetBaselineButton"),
  markerButton: document.getElementById("markerButton"),
  downloadCsvButton: document.getElementById("downloadCsvButton"),
  downloadJsonButton: document.getElementById("downloadJsonButton"),
  showResultsButton: document.getElementById("showResultsButton"),
  resultsPanel: document.getElementById("resultsPanel"),
  closeResultsButton: document.getElementById("closeResultsButton"),
  resultTitle: document.getElementById("resultTitle"),
  resultRowCount: document.getElementById("resultRowCount"),
  resultMaxMotion: document.getElementById("resultMaxMotion"),
  resultMaxFace: document.getElementById("resultMaxFace"),
  resultAvgQuality: document.getElementById("resultAvgQuality"),
  resultMarkerCount: document.getElementById("resultMarkerCount"),
  resultChart: document.getElementById("resultChart"),
  resultRows: document.getElementById("resultRows"),
  collectorUrl: document.getElementById("collectorUrl"),
  collectorToken: document.getElementById("collectorToken"),
  autoUploadCheck: document.getElementById("autoUploadCheck"),
  uploadButton: document.getElementById("uploadButton"),
  clearUploadButton: document.getElementById("clearUploadButton"),
  uploadStatus: document.getElementById("uploadStatus"),
  participantId: document.getElementById("participantId"),
  stimulusName: document.getElementById("stimulusName"),
  sessionNote: document.getElementById("sessionNote"),
  cameraFacing: document.getElementById("cameraFacing"),
  motionScore: document.getElementById("motionScore"),
  postureScore: document.getElementById("postureScore"),
  headPose: document.getElementById("headPose"),
  blinkRate: document.getElementById("blinkRate"),
  facePresence: document.getElementById("facePresence"),
  stillnessScore: document.getElementById("stillnessScore"),
  baselineDelta: document.getElementById("baselineDelta"),
  qualityScore: document.getElementById("qualityScore"),
  sessionClock: document.getElementById("sessionClock"),
  cameraStatus: document.getElementById("cameraStatus"),
  statusText: document.getElementById("statusText"),
  capabilityList: document.getElementById("capabilityList"),
  baselineStatus: document.getElementById("baselineStatus"),
};

const state = {
  startedAt: 0,
  recording: false,
  recordStartedAt: 0,
  lastRecordedAt: 0,
  lastSampleAt: 0,
  prevFrame: null,
  motion: 0,
  posture: 0,
  head: "--",
  headYaw: 0,
  headPitch: 0,
  eyeRatio: 0,
  facialMovement: 0,
  mouthOpenRatio: 0,
  smileProxy: 0,
  browMovementProxy: 0,
  facePresent: false,
  faceMissingStartedAt: 0,
  brightness: 0,
  quality: 0,
  stillness: 0,
  baseline: null,
  baselineSamples: [],
  baselineUntil: 0,
  blinkCount: 0,
  lastBlinkAt: 0,
  lastEyesClosed: false,
  markers: [],
  rows: [],
  chartPoints: [],
  poseReady: false,
  faceReady: false,
  poseLandmarks: null,
  faceLandmarks: null,
  pose: null,
  faceMesh: null,
  busyMl: false,
  animationFrameId: 0,
  consented: false,
  uploadInProgress: false,
  suppressAutoUploadOnce: false,
  facingMode: "user",
};

const sampleSize = { width: 96, height: 72 };
const maxChartPoints = 240;
const motionThreshold = 18;
const baselineDurationMs = 15000;
const defaultCollectorUrl =
  "https://script.google.com/macros/s/AKfycbyjychBnbo4FGtoXed-HN8bs73L0avDPjr0kP1bcXZnpUMcwSH3Jbt5Kgf0ZIt3_kC8/exec";
const collectorUrlKey = "bodyResponseCollectorUrl";
const collectorTokenKey = "bodyResponseCollectorToken";
const autoUploadKey = "bodyResponseAutoUpload";

function setStatus(text, mode = "idle") {
  els.statusText.textContent = text;
  els.cameraStatus.className = "status-dot";
  if (mode === "live") els.cameraStatus.classList.add("live");
  if (mode === "warn") els.cameraStatus.classList.add("warn");
}

function updateCapabilities() {
  const camera = els.video.srcObject ? "動作中" : "待機中";
  const motion = els.video.srcObject ? "動作中" : "待機中";
  const pose = state.poseReady ? "有効" : window.Pose ? "準備中" : "CDN未読込";
  const face = state.faceReady ? "有効" : window.FaceMesh ? "準備中" : "CDN未読込";
  els.capabilityList.innerHTML = `
    <li>カメラ: ${camera}</li>
    <li>動き解析: ${motion}</li>
    <li>姿勢推定: ${pose}</li>
    <li>顔推定: ${face}</li>
  `;
}

function fitCanvases() {
  const rect = els.overlay.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  for (const canvas of [els.overlay, els.chart]) {
    if (canvas === els.chart) continue;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }
  els.sample.width = sampleSize.width;
  els.sample.height = sampleSize.height;
}

async function initModels() {
  if (window.Pose) {
    state.pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });
    state.pose.setOptions({
      modelComplexity: 0,
      smoothLandmarks: true,
      minDetectionConfidence: 0.55,
      minTrackingConfidence: 0.55,
    });
    state.pose.onResults((results) => {
      state.poseReady = true;
      state.poseLandmarks = results.poseLandmarks || null;
      updatePostureFromPose();
    });
  }

  if (window.FaceMesh) {
    state.faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });
    state.faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.55,
      minTrackingConfidence: 0.55,
    });
    state.faceMesh.onResults((results) => {
      state.faceReady = true;
      state.faceLandmarks = results.multiFaceLandmarks?.[0] || null;
      updateFaceMetrics();
    });
  }
  updateCapabilities();
}

async function startCamera(options = {}) {
  const { autoRecord = true } = options;
  if (!state.consented) {
    setStatus("同意確認が必要です", "warn");
    return;
  }
  try {
    setStatus("カメラ許可を確認中", "warn");
    state.facingMode = els.cameraFacing.value;
    const stream = await requestCameraStream(state.facingMode);
    els.video.srcObject = stream;
    await els.video.play();
    state.startedAt = performance.now();
    els.permissionPanel.style.display = "none";
    els.startButton.disabled = true;
    els.stopCameraButton.disabled = false;
    els.recordButton.disabled = false;
    els.baselineButton.disabled = false;
    els.resetBaselineButton.disabled = false;
    els.markerButton.disabled = false;
    setStatus("解析中", "live");
    fitCanvases();
    await initModels();
    state.animationFrameId = requestAnimationFrame(loop);
    if (autoRecord && !state.recording) {
      toggleRecording();
    }
  } catch (error) {
    console.error(error);
    setStatus("カメラを開始できませんでした", "warn");
    els.permissionPanel.style.display = "";
    els.startButton.disabled = false;
    els.stopCameraButton.disabled = true;
    els.permissionPanel.querySelector("p").textContent = cameraErrorMessage(error);
  }
}

async function requestCameraStream(facingMode) {
  const base = { width: { ideal: 1280 }, height: { ideal: 720 } };
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { ...base, facingMode: { ideal: facingMode } },
      audio: false,
    });
  } catch (error) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      throw error;
    }
    return navigator.mediaDevices.getUserMedia({ video: base, audio: false });
  }
}

function cameraErrorMessage(error) {
  const name = error?.name || "UnknownError";
  if (!navigator.mediaDevices?.getUserMedia) {
    return "このブラウザではカメラ機能が使えません。Chrome / Edge / Safari の最新版で、HTTPSの公開URLから開いてください。";
  }
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "カメラ許可が拒否されています。ブラウザのアドレスバー付近のカメラ権限、またはOSのプライバシー設定でカメラを許可してください。";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "使用できるカメラが見つかりません。外部カメラの接続、またはPCのカメラ設定を確認してください。";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "カメラを開始できません。Zoom、Teams、カメラアプリなど別のアプリがカメラを使用していないか確認してください。";
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return "選択したカメラ条件で開始できませんでした。前面カメラに切り替えるか、ブラウザを再読み込みしてください。";
  }
  return `カメラを開始できませんでした (${name})。ブラウザのカメラ許可、HTTPSのURL、別アプリのカメラ使用状況を確認してください。`;
}

function stopCamera() {
  const hadRows = state.rows.length > 0;
  if (state.recording) {
    toggleRecording();
  }
  if (state.animationFrameId) {
    cancelAnimationFrame(state.animationFrameId);
    state.animationFrameId = 0;
  }
  const stream = els.video.srcObject;
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
  els.video.srcObject = null;
  state.poseLandmarks = null;
  state.faceLandmarks = null;
  state.facePresent = false;
  state.prevFrame = null;
  els.permissionPanel.style.display = "";
  els.startButton.disabled = false;
  els.stopCameraButton.disabled = true;
  els.recordButton.disabled = true;
  els.baselineButton.disabled = true;
  els.resetBaselineButton.disabled = true;
  els.markerButton.disabled = true;
  setStatus("撮影停止", "idle");
  updateCapabilities();
  if (state.rows.length || hadRows) {
    showResults();
  }
}

async function switchCamera() {
  state.facingMode = els.cameraFacing.value;
  if (!els.video.srcObject) return;
  const wasRecording = state.recording;
  if (wasRecording) {
    state.suppressAutoUploadOnce = true;
    toggleRecording();
  }
  stopCamera();
  await startCamera({ autoRecord: false });
  if (wasRecording) {
    toggleRecording();
  }
}

function loop(now) {
  if (!els.video.srcObject) return;
  if (!els.video.videoWidth) {
    state.animationFrameId = requestAnimationFrame(loop);
    return;
  }

  fitCanvases();
  sampleMotion();
  if (!state.busyMl && now - state.lastSampleAt > 90) {
    runModels();
    state.lastSampleAt = now;
  }
  drawOverlay();
  drawChart();
  updateQualityMetrics();
  updateBaselineSampling(now);
  updateReadouts();
  maybeRecord(now);
  state.animationFrameId = requestAnimationFrame(loop);
}

async function runModels() {
  state.busyMl = true;
  try {
    if (state.pose) await state.pose.send({ image: els.video });
    if (state.faceMesh) await state.faceMesh.send({ image: els.video });
  } catch (error) {
    console.warn("MediaPipe analysis skipped", error);
  } finally {
    state.busyMl = false;
    updateCapabilities();
  }
}

function sampleMotion() {
  const ctx = els.sample.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(els.video, 0, 0, sampleSize.width, sampleSize.height);
  const frame = ctx.getImageData(0, 0, sampleSize.width, sampleSize.height).data;
  if (!state.prevFrame) {
    state.prevFrame = new Uint8ClampedArray(frame);
    return;
  }

  let changed = 0;
  let total = 0;
  let brightness = 0;
  for (let i = 0; i < frame.length; i += 4) {
    const diff =
      Math.abs(frame[i] - state.prevFrame[i]) +
      Math.abs(frame[i + 1] - state.prevFrame[i + 1]) +
      Math.abs(frame[i + 2] - state.prevFrame[i + 2]);
    if (diff > motionThreshold) changed += 1;
    total += diff;
    brightness += (frame[i] + frame[i + 1] + frame[i + 2]) / 3;
  }
  state.motion = Math.min(100, Math.round((changed / (sampleSize.width * sampleSize.height)) * 180));
  state.brightness = Math.round(brightness / (sampleSize.width * sampleSize.height));
  state.stillness = Math.max(0, 100 - state.motion);
  state.prevFrame.set(frame);
}

function updatePostureFromPose() {
  const lm = state.poseLandmarks;
  if (!lm) return;
  const leftShoulder = lm[11];
  const rightShoulder = lm[12];
  const nose = lm[0];
  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
  const lean = Math.abs(nose.x - shoulderMidX) * 130;
  const forward = Math.max(0, (shoulderMidY - nose.y - 0.18) * 160);
  const tilt = Math.abs(leftShoulder.y - rightShoulder.y) * 180;
  state.posture = Math.round(Math.min(100, lean + forward + tilt));
}

function updateFaceMetrics() {
  const lm = state.faceLandmarks;
  if (!lm) return;

  const leftCheek = lm[234];
  const rightCheek = lm[454];
  const nose = lm[1];
  const center = (leftCheek.x + rightCheek.x) / 2;
  const yaw = (nose.x - center) * 100;
  state.headYaw = Number(yaw.toFixed(2));
  state.headPitch = Number(((nose.y - ((leftCheek.y + rightCheek.y) / 2)) * 100).toFixed(2));
  state.head = yaw > 3.8 ? "右向き" : yaw < -3.8 ? "左向き" : "正面";
  state.facePresent = true;

  const top = lm[159];
  const bottom = lm[145];
  const outer = lm[33];
  const inner = lm[133];
  const vertical = distance(top, bottom);
  const horizontal = Math.max(0.001, distance(outer, inner));
  const ratio = vertical / horizontal;
  const closed = ratio < 0.18;
  const now = performance.now();
  if (closed && !state.lastEyesClosed && now - state.lastBlinkAt > 180) {
    state.blinkCount += 1;
    state.lastBlinkAt = now;
  }
  state.lastEyesClosed = closed;
  state.eyeRatio = ratio;

  const mouthTop = lm[13];
  const mouthBottom = lm[14];
  const mouthLeft = lm[61];
  const mouthRight = lm[291];
  state.mouthOpenRatio = Number((distance(mouthTop, mouthBottom) / Math.max(0.001, distance(mouthLeft, mouthRight))).toFixed(4));
  state.smileProxy = Number(Math.max(0, (distance(mouthLeft, mouthRight) - distance(leftCheek, rightCheek) * 0.34) * 100).toFixed(2));

  const browLeft = lm[105];
  const browRight = lm[334];
  const eyeLeft = lm[159];
  const eyeRight = lm[386];
  state.browMovementProxy = Number((((eyeLeft.y - browLeft.y) + (eyeRight.y - browRight.y)) * 50).toFixed(2));
  state.facialMovement = Math.round(
    Math.min(100, state.mouthOpenRatio * 120 + Math.abs(state.smileProxy) * 0.8 + Math.abs(state.browMovementProxy) * 1.8),
  );
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function drawOverlay() {
  const canvas = els.overlay;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.scale(-1, 1);
  ctx.translate(-w, 0);

  if (state.poseLandmarks && window.drawConnectors && window.POSE_CONNECTIONS) {
    drawConnectors(ctx, state.poseLandmarks, POSE_CONNECTIONS, {
      color: "rgba(23,108,100,0.72)",
      lineWidth: 3,
    });
    drawLandmarks(ctx, state.poseLandmarks, {
      color: "rgba(255,255,255,0.9)",
      lineWidth: 1,
      radius: 2,
    });
  }

  if (state.faceLandmarks) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
    for (const idx of [1, 33, 133, 145, 159, 234, 454]) {
      const p = toCanvasPoint(state.faceLandmarks[idx]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function toCanvasPoint(point) {
  return {
    x: point.x * els.overlay.width,
    y: point.y * els.overlay.height,
  };
}

function drawChart() {
  const canvas = els.chart;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.round(rect.width * dpr);
  const height = Math.round(rect.height * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = "#d7ded8";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = (height / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  appendChartPoint();
  drawSeries(ctx, width, height, "motion", "#176c64");
  drawSeries(ctx, width, height, "posture", "#b85c1f");
  drawSeries(ctx, width, height, "quality", "#3d5f91");
}

function appendChartPoint() {
  const last = state.chartPoints[state.chartPoints.length - 1];
  const now = performance.now();
  if (last && now - last.t < 180) return;
  state.chartPoints.push({ t: now, motion: state.motion, posture: state.posture, quality: state.quality });
  if (state.chartPoints.length > maxChartPoints) state.chartPoints.shift();
}

function drawSeries(ctx, width, height, key, color) {
  if (state.chartPoints.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  state.chartPoints.forEach((point, index) => {
    const x = (index / (maxChartPoints - 1)) * width;
    const y = height - (point[key] / 100) * (height - 12) - 6;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function updateQualityMetrics() {
  if (!state.faceLandmarks) {
    if (!state.faceMissingStartedAt) state.faceMissingStartedAt = performance.now();
    state.facePresent = false;
  } else {
    state.faceMissingStartedAt = 0;
  }

  const brightnessScore = clamp(100 - Math.abs(state.brightness - 135) * 0.9, 0, 100);
  const faceScore = state.facePresent ? 100 : 35;
  const poseScore = state.poseLandmarks ? 100 : 65;
  state.quality = Math.round(brightnessScore * 0.35 + faceScore * 0.4 + poseScore * 0.25);
}

function updateBaselineSampling(now) {
  if (!state.baselineUntil) return;
  state.baselineSamples.push({
    motion: state.motion,
    posture: state.posture,
    facialMovement: state.facialMovement,
    blinkRate: currentBlinkRate(),
    quality: state.quality,
  });
  const remaining = Math.max(0, state.baselineUntil - now);
  els.baselineStatus.textContent = `基準値: 計測中 ${Math.ceil(remaining / 1000)}秒`;
  if (remaining > 0) return;

  state.baseline = averageBaseline(state.baselineSamples);
  state.baselineUntil = 0;
  els.baselineStatus.textContent = `基準値: 体動 ${state.baseline.motion}, 姿勢 ${state.baseline.posture}, 表情 ${state.baseline.facialMovement}`;
  setStatus("基準計測が完了", "live");
}

function averageBaseline(samples) {
  const keys = ["motion", "posture", "facialMovement", "blinkRate", "quality"];
  return Object.fromEntries(
    keys.map((key) => [
      key,
      Number((samples.reduce((sum, sample) => sum + sample[key], 0) / Math.max(1, samples.length)).toFixed(2)),
    ]),
  );
}

function updateReadouts() {
  const elapsed = Math.max(0, performance.now() - state.startedAt);
  els.sessionClock.textContent = formatDuration(elapsed);
  els.motionScore.textContent = String(state.motion);
  els.postureScore.textContent = String(state.posture);
  els.headPose.textContent = state.head;
  els.blinkRate.textContent = `${currentBlinkRate()}/min`;
  els.facePresence.textContent = state.facePresent ? "検出" : "--";
  els.stillnessScore.textContent = String(state.stillness);
  els.qualityScore.textContent = String(state.quality);
  els.baselineDelta.textContent = state.baseline ? signed(Math.round(state.motion - state.baseline.motion)) : "--";
}

function maybeRecord(now) {
  if (!state.recording) return;
  if (now - state.lastRecordedAt < 250) return;
  state.rows.push(currentRow(now, ""));
  state.lastRecordedAt = now;
  els.downloadCsvButton.disabled = state.rows.length === 0;
  els.downloadJsonButton.disabled = state.rows.length === 0;
  els.showResultsButton.disabled = state.rows.length === 0;
  els.uploadButton.disabled = state.rows.length === 0 || !els.collectorUrl.value.trim();
}

function currentRow(now, marker) {
  const baselineMotionDelta = state.baseline ? state.motion - state.baseline.motion : "";
  const baselinePostureDelta = state.baseline ? state.posture - state.baseline.posture : "";
  const faceMissingMs = state.faceMissingStartedAt ? Math.round(now - state.faceMissingStartedAt) : 0;
  return {
    timestamp_ms: Math.round(now - state.recordStartedAt),
    iso_time: new Date().toISOString(),
    participant_id: els.participantId.value.trim(),
    stimulus_name: els.stimulusName.value.trim(),
    note: els.sessionNote.value.trim(),
    marker,
    standard_motion_intensity: state.motion,
    standard_posture_change: state.posture,
    standard_head_pose_label: state.head,
    standard_head_yaw_proxy: state.headYaw,
    standard_head_pitch_proxy: state.headPitch,
    standard_blink_count: state.blinkCount,
    standard_blink_rate_per_min: currentBlinkRate(),
    standard_eye_open_ratio: Number(state.eyeRatio.toFixed(4)),
    exploratory_facial_movement_intensity: state.facialMovement,
    exploratory_mouth_open_ratio: state.mouthOpenRatio,
    exploratory_smile_proxy: state.smileProxy,
    exploratory_brow_movement_proxy: state.browMovementProxy,
    exploratory_stillness: state.stillness,
    exploratory_face_missing_ms: faceMissingMs,
    exploratory_baseline_motion_delta: baselineMotionDelta,
    exploratory_baseline_posture_delta: baselinePostureDelta,
    quality_score: state.quality,
    quality_face_present: state.facePresent,
    quality_pose_present: Boolean(state.poseLandmarks),
    quality_brightness: state.brightness,
    quality_baseline_available: Boolean(state.baseline),
  };
}

function toggleRecording() {
  state.recording = !state.recording;
  if (state.recording) {
    state.recordStartedAt = performance.now();
    state.lastRecordedAt = 0;
    state.rows = [];
    state.markers = [];
    els.showResultsButton.disabled = true;
    els.downloadCsvButton.disabled = true;
    els.downloadJsonButton.disabled = true;
    els.uploadButton.disabled = true;
    els.recordButton.textContent = "記録停止";
    setStatus("記録中", "live");
  } else {
    els.recordButton.textContent = "記録開始";
    setStatus("解析中", "live");
    els.downloadCsvButton.disabled = state.rows.length === 0;
    els.downloadJsonButton.disabled = state.rows.length === 0;
    els.showResultsButton.disabled = state.rows.length === 0;
    els.uploadButton.disabled = state.rows.length === 0 || !els.collectorUrl.value.trim();
    if (state.suppressAutoUploadOnce) {
      state.suppressAutoUploadOnce = false;
    } else if (els.autoUploadCheck.checked && els.collectorUrl.value.trim() && state.rows.length) {
      uploadRows();
    }
  }
}

function addMarker() {
  if (!els.video.srcObject) return;
  const label = `marker_${state.markers.length + 1}`;
  state.markers.push({ label, at: performance.now() });
  if (state.recording) {
    const now = performance.now();
    state.rows.push(currentRow(now, label));
    state.lastRecordedAt = now;
    els.showResultsButton.disabled = state.rows.length === 0;
    els.uploadButton.disabled = state.rows.length === 0 || !els.collectorUrl.value.trim();
  }
  setStatus(`${label} を追加`, "live");
}

function showResults() {
  if (!state.rows.length) return;
  els.resultsPanel.classList.remove("hidden");
  requestAnimationFrame(() => renderResults(state.rows));
}

function closeResults() {
  els.resultsPanel.classList.add("hidden");
}

function renderResults(rows) {
  const participant = els.participantId.value.trim() || rows[0]?.participant_id || "participant";
  const stimulus = els.stimulusName.value.trim() || rows[0]?.stimulus_name || "session";
  els.resultTitle.textContent = `${participant} / ${stimulus}`;
  els.resultRowCount.textContent = String(rows.length);
  els.resultMaxMotion.textContent = String(maxRows(rows, "standard_motion_intensity"));
  els.resultMaxFace.textContent = String(maxRows(rows, "exploratory_facial_movement_intensity"));
  els.resultAvgQuality.textContent = String(avgRows(rows, "quality_score"));
  els.resultMarkerCount.textContent = String(rows.filter((row) => row.marker).length);
  els.resultRows.innerHTML = rows
    .slice(0, 160)
    .map(
      (row) => `
        <tr>
          <td>${row.timestamp_ms}</td>
          <td>${escapeHtml(row.marker || "")}</td>
          <td>${row.standard_motion_intensity}</td>
          <td>${row.standard_posture_change}</td>
          <td>${escapeHtml(row.standard_head_pose_label || "")}</td>
          <td>${row.standard_blink_rate_per_min}</td>
          <td>${row.exploratory_facial_movement_intensity}</td>
          <td>${row.exploratory_stillness}</td>
          <td>${row.quality_score}</td>
        </tr>
      `,
    )
    .join("");
  drawResultChart(rows);
}

function drawResultChart(rows) {
  const canvas = els.resultChart;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  const width = canvas.width;
  const height = canvas.height;
  const pad = { left: 44 * dpr, right: 16 * dpr, top: 12 * dpr, bottom: 28 * dpr };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const minTime = rows[0]?.timestamp_ms || 0;
  const maxTime = rows[rows.length - 1]?.timestamp_ms || 1;
  const series = [
    ["standard_motion_intensity", "#176c64"],
    ["standard_posture_change", "#b85c1f"],
    ["exploratory_facial_movement_intensity", "#865a87"],
    ["quality_score", "#3d5f91"],
  ];

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfcfa";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#d7ded8";
  ctx.lineWidth = dpr;
  ctx.fillStyle = "#65716b";
  ctx.font = `${12 * dpr}px sans-serif`;

  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + chartHeight * (i / 4);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillText(String(100 - i * 25), 6 * dpr, y + 4 * dpr);
  }

  for (const row of rows.filter((item) => item.marker)) {
    const x = pad.left + ((row.timestamp_ms - minTime) / Math.max(1, maxTime - minTime)) * chartWidth;
    ctx.strokeStyle = "#17211d";
    ctx.setLineDash([5 * dpr, 5 * dpr]);
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, pad.top + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#17211d";
    ctx.fillText(row.marker, x + 6 * dpr, pad.top + 16 * dpr);
  }

  for (const [key, color] of series) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 * dpr;
    ctx.beginPath();
    rows.forEach((row, index) => {
      const x = pad.left + ((row.timestamp_ms - minTime) / Math.max(1, maxTime - minTime)) * chartWidth;
      const y = pad.top + chartHeight - (Number(row[key] || 0) / 100) * chartHeight;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

function maxRows(rows, key) {
  return Math.max(...rows.map((row) => Number(row[key] || 0)));
}

function avgRows(rows, key) {
  return Math.round(rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) / Math.max(1, rows.length));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);
}

function startBaseline() {
  if (!els.video.srcObject) return;
  state.baselineSamples = [];
  state.baselineUntil = performance.now() + baselineDurationMs;
  els.baselineStatus.textContent = "基準値: 計測中 15秒";
  setStatus("基準計測中", "live");
}

function resetBaseline() {
  state.baseline = null;
  state.baselineSamples = [];
  state.baselineUntil = 0;
  els.baselineStatus.textContent = "基準値: 未計測";
  setStatus("基準値をリセット", "live");
}

function currentBlinkRate() {
  const elapsed = Math.max(1 / 60, (performance.now() - state.startedAt) / 60000);
  return Math.round(state.blinkCount / elapsed);
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function download(format) {
  if (!state.rows.length) return;
  const baseName = outputBaseName();

  if (format === "json") {
    saveBlob(`${baseName}.json`, "application/json", JSON.stringify(state.rows, null, 2));
    return;
  }

  const csv = rowsToCsv(state.rows);
  saveBlob(`${baseName}.csv`, "text/csv;charset=utf-8", `\uFEFF${csv}`);
}

async function uploadRows() {
  const url = els.collectorUrl.value.trim();
  if (!url || !state.rows.length || state.uploadInProgress) return;

  state.uploadInProgress = true;
  els.uploadButton.disabled = true;
  els.uploadStatus.textContent = "送信状態: 送信中";

  const payload = {
    fileName: `${outputBaseName()}.csv`,
    participantId: els.participantId.value.trim(),
    stimulusName: els.stimulusName.value.trim(),
    note: els.sessionNote.value.trim(),
    collectorToken: els.collectorToken.value.trim(),
    rowCount: state.rows.length,
    csv: rowsToCsv(state.rows),
    rows: state.rows,
  };

  try {
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
    });
    els.uploadStatus.textContent = `送信状態: 送信しました (${state.rows.length}行)`;
    setStatus("CSVを送信しました", "live");
  } catch (error) {
    console.error(error);
    els.uploadStatus.textContent = "送信状態: 送信に失敗";
    setStatus("CSV送信に失敗", "warn");
  } finally {
    state.uploadInProgress = false;
    els.uploadButton.disabled = state.rows.length === 0 || !els.collectorUrl.value.trim();
  }
}

function rowsToCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(",")),
  ].join("\n");
}

function outputBaseName() {
  return [
    "body-response",
    els.participantId.value.trim() || "participant",
    new Date().toISOString().replace(/[:.]/g, "-"),
  ].join("_");
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function saveBlob(filename, type, content) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function acceptConsent() {
  if (!els.consentCheck.checked) return;
  state.consented = true;
  els.consentPanel.classList.add("hidden");
  setStatus("待機中", "idle");
}

function restoreCollectionSettings() {
  const params = new URLSearchParams(window.location.search);
  const tokenFromUrl = params.get("collectorToken") || params.get("key") || "";
  els.collectorUrl.value = localStorage.getItem(collectorUrlKey) || defaultCollectorUrl;
  els.collectorToken.value = tokenFromUrl || localStorage.getItem(collectorTokenKey) || "";
  if (tokenFromUrl) {
    localStorage.setItem(collectorTokenKey, tokenFromUrl);
  }
  els.autoUploadCheck.checked = localStorage.getItem(autoUploadKey) !== "false";
  els.uploadButton.disabled = state.rows.length === 0 || !els.collectorUrl.value.trim();
  els.uploadStatus.textContent = "送信状態: 回収先URL設定済み";
}

function saveCollectionSettings() {
  localStorage.setItem(collectorUrlKey, els.collectorUrl.value.trim());
  localStorage.setItem(collectorTokenKey, els.collectorToken.value.trim());
  localStorage.setItem(autoUploadKey, String(els.autoUploadCheck.checked));
  els.uploadButton.disabled = state.rows.length === 0 || !els.collectorUrl.value.trim();
}

function clearCollectionSettings() {
  els.collectorUrl.value = defaultCollectorUrl;
  els.collectorToken.value = "";
  els.autoUploadCheck.checked = true;
  localStorage.removeItem(collectorUrlKey);
  localStorage.removeItem(collectorTokenKey);
  localStorage.removeItem(autoUploadKey);
  els.uploadButton.disabled = state.rows.length === 0;
  els.uploadStatus.textContent = "送信状態: 初期URLに戻しました";
}

els.consentCheck.addEventListener("change", () => {
  els.consentButton.disabled = !els.consentCheck.checked;
});
els.consentButton.addEventListener("click", acceptConsent);
els.startButton.addEventListener("click", startCamera);
els.stopCameraButton.addEventListener("click", stopCamera);
els.cameraFacing.addEventListener("change", switchCamera);
els.recordButton.addEventListener("click", toggleRecording);
els.baselineButton.addEventListener("click", startBaseline);
els.resetBaselineButton.addEventListener("click", resetBaseline);
els.markerButton.addEventListener("click", addMarker);
els.downloadCsvButton.addEventListener("click", () => download("csv"));
els.downloadJsonButton.addEventListener("click", () => download("json"));
els.showResultsButton.addEventListener("click", showResults);
els.closeResultsButton.addEventListener("click", closeResults);
els.uploadButton.addEventListener("click", uploadRows);
els.collectorUrl.addEventListener("change", saveCollectionSettings);
els.collectorToken.addEventListener("change", saveCollectionSettings);
els.autoUploadCheck.addEventListener("change", saveCollectionSettings);
els.clearUploadButton.addEventListener("click", clearCollectionSettings);
window.addEventListener("resize", () => {
  fitCanvases();
  if (!els.resultsPanel.classList.contains("hidden") && state.rows.length) {
    drawResultChart(state.rows);
  }
});
restoreCollectionSettings();
updateCapabilities();
drawChart();
