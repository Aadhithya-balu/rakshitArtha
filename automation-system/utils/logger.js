const logs = [];

function write(level, message, data) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level,
    message,
    ...(data !== undefined ? { data } : {}),
  };

  const prefix = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  console.log(prefix, data !== undefined ? data : '');

  logs.push(entry);
  if (logs.length > 100) {
    logs.shift();
  }
}

const logger = {
  log: (message, data) => write('info', message, data),
  info: (message, data) => write('info', message, data),
  warn: (message, data) => write('warn', message, data),
  error: (message, data) => write('error', message, data),
  debug: (message, data) => write('debug', message, data),
  getLogs: () => logs,
};

module.exports = logger;
