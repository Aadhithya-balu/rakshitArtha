const fs = require('fs');
const path = require('path');

const logsDir = 'logs';
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

const logFile = path.join(logsDir, 'app.log');

const getTimestamp = () => {
    return new Date().toISOString();
};

const writeLog = (level, message, data = null) => {
    const logEntry = {
        timestamp: getTimestamp(),
        level,
        message,
        ...(data && { data })
    };

    const logString = JSON.stringify(logEntry) + '\n';

    // Write to file
    fs.appendFileSync(logFile, logString);

    // Console output
    const colorMap = {
        info: '\x1b[36m',    // cyan
        error: '\x1b[31m',   // red
        warn: '\x1b[33m',    // yellow
        debug: '\x1b[35m'    // magenta
    };

    const reset = '\x1b[0m';
    const color = colorMap[level] || '';

    console.log(`${color}[${level.toUpperCase()}] ${getTimestamp()} - ${message}${reset}`, data || '');
};

module.exports = {
    info: (message, data) => writeLog('info', message, data),
    error: (message, data) => writeLog('error', message, data),
    warn: (message, data) => writeLog('warn', message, data),
    debug: (message, data) => writeLog('debug', message, data)
};
