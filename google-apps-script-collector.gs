const CONFIG = {
  // Optional. If you set a value here, the web app only accepts requests that
  // include the same collectorToken in the JSON body.
  // Do not put real personal information in this token.
  COLLECTOR_TOKEN: "",
  MAX_ROWS: 12000,
  MAX_TEXT_LENGTH: 500,
};

const EXPECTED_HEADERS = [
  "timestamp_ms",
  "iso_time",
  "participant_id",
  "stimulus_name",
  "note",
  "marker",
  "standard_motion_intensity",
  "standard_posture_change",
  "standard_head_pose_label",
  "standard_head_yaw_proxy",
  "standard_head_pitch_proxy",
  "standard_blink_count",
  "standard_blink_rate_per_min",
  "standard_eye_open_ratio",
  "exploratory_facial_movement_intensity",
  "exploratory_mouth_open_ratio",
  "exploratory_smile_proxy",
  "exploratory_brow_movement_proxy",
  "exploratory_stillness",
  "exploratory_face_missing_ms",
  "exploratory_baseline_motion_delta",
  "exploratory_baseline_posture_delta",
  "quality_score",
  "quality_face_present",
  "quality_pose_present",
  "quality_brightness",
  "quality_baseline_available",
];

function doGet() {
  return ContentService.createTextOutput("Body Response Collector is running.");
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return textResponse("missing body");
    }

    const payload = JSON.parse(e.postData.contents);
    if (CONFIG.COLLECTOR_TOKEN && payload.collectorToken !== CONFIG.COLLECTOR_TOKEN) {
      return textResponse("unauthorized");
    }

    const rows = Array.isArray(payload.rows) ? payload.rows.slice(0, CONFIG.MAX_ROWS) : [];
    if (rows.length === 0) {
      return textResponse("no rows");
    }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["received_at", "file_name"].concat(EXPECTED_HEADERS));
    }

    const receivedAt = new Date();
    const fileName = sanitizeText(payload.fileName || "");
    const values = rows.map(function (row) {
      return [receivedAt, fileName].concat(
        EXPECTED_HEADERS.map(function (key) {
          return sanitizeValue(row[key]);
        }),
      );
    });

    sheet.getRange(sheet.getLastRow() + 1, 1, values.length, values[0].length).setValues(values);
    return textResponse("ok");
  } catch (error) {
    return textResponse("error");
  }
}

function sanitizeValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : "";
  }
  if (typeof value === "boolean") {
    return value;
  }
  return sanitizeText(value);
}

function sanitizeText(value) {
  const text = String(value == null ? "" : value)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .slice(0, CONFIG.MAX_TEXT_LENGTH);

  // Prevent spreadsheet formula injection.
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function textResponse(text) {
  return ContentService.createTextOutput(text);
}
