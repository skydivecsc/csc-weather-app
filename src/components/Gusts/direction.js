const COMPASS_POINTS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];
const PLACEHOLDER_IDS = new Set(["starting_gust", "not_connected!", "no_report!"]);

export const isPlaceholder = (sample) => PLACEHOLDER_IDS.has(sample?.unique_id);

export function recordedDirection(sample) {
  if (isPlaceholder(sample) || !(Number(sample?.wind_speed) > 0)) return null;
  const raw = sample?.direction;
  if (raw === null || raw === undefined || typeof raw === "boolean" || raw === "") return null;
  const direction = Number(raw);
  // The legacy collector also stored missing directions as zero. Do not
  // turn those ambiguous records into a claim of northerly wind.
  return Number.isFinite(direction) && direction > 0 && direction <= 360
    ? direction
    : null;
}

export function directionLabel(sample) {
  if (isPlaceholder(sample)) return "Direction unavailable";
  if (sample?.wind_speed !== null && sample?.wind_speed !== undefined && Number(sample.wind_speed) === 0) {
    return "Calm — direction unavailable";
  }
  const direction = recordedDirection(sample);
  if (direction === null) return "Direction unavailable";
  const compass = COMPASS_POINTS[Math.round(direction / 22.5) % 16];
  return `Wind from ${direction}° (${compass})`;
}

export const flowRotation = (direction) => (direction + 180) % 360;

const arrowMarkers = new Map();

export function windArrowMarker(size = 18) {
  if (arrowMarkers.has(size)) return arrowMarkers.get(size);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return "circle";
  context.scale(size / 18, size / 18);
  // A north-pointing arrow; Chart.js rotates this cached marker per sample.
  context.beginPath();
  context.moveTo(9, 1);
  context.lineTo(16, 9);
  context.lineTo(11.5, 8);
  context.lineTo(11.5, 16);
  context.lineTo(6.5, 16);
  context.lineTo(6.5, 8);
  context.lineTo(2, 9);
  context.closePath();
  context.fillStyle = "rgb(8, 228, 209)";
  context.fill();
  context.strokeStyle = "#111";
  context.lineWidth = 1.5;
  context.lineJoin = "round";
  context.stroke();
  arrowMarkers.set(size, canvas);
  return canvas;
}
