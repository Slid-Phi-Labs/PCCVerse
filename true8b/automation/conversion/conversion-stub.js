/** Minimal freemium conversion event emitter — drop-in */
const FREE_CAP = 100 * 1024 * 1024 * 1024; // 100 GB

function emit(event, props = {}) {
  const row = { ts: new Date().toISOString(), event, ...props };
  console.log(JSON.stringify(row));
  return row;
}

function trackFreeBytes(id, bytes) {
  // Host: replace with real counter
  emit("suite_free_progress", { id, bytes });
}

function trackConversion(id, product, days) {
  emit("suite_conversion", { id, product, days_to_convert: days });
}

module.exports = { emit, trackFreeBytes, trackConversion, FREE_CAP };
