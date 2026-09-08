const PLACEHOLDER_IDS = new Set(["starting_gust", "not_connected!", "no_report!"]);

export function recordedDirection(sample) {
  if (PLACEHOLDER_IDS.has(sample?.unique_id)) return null;
  const speed = sample?.wind_speed;
  const raw = sample?.direction;
  if (!["number", "string"].includes(typeof speed) || !Number.isFinite(Number(speed)) || Number(speed) <= 0) return null;
  if (!["number", "string"].includes(typeof raw)) return null;
  const direction = Number(raw);
  // The collector historically uses zero for missing direction; 360 is north.
  return Number.isFinite(direction) && direction > 0 && direction <= 360 ? direction : null;
}

// Recorded bearings are wind FROM; arrows point in the direction of airflow.
export const flowRotation = (direction) => (direction + 180) % 360;
