const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const configuredLevel = process.env.LOG_LEVEL || "info";
const activeLevel = levels[configuredLevel] ?? levels.info;

function write(level, message, meta) {
  if (levels[level] > activeLevel) return;

  const entry = {
    level,
    message,
    time: new Date().toISOString(),
  };

  if (meta && Object.keys(meta).length) {
    entry.meta = meta;
  }

  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

module.exports = {
  error: (message, meta) => write("error", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  info: (message, meta) => write("info", message, meta),
  debug: (message, meta) => write("debug", message, meta),
};
