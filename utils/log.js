const dotenv = require("dotenv");
const winston = require("winston");
const { createLogger, format, transports } = winston;

dotenv.config();

const colorizer = format.colorize();

const logFormat = format.combine(
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  format.errors({ stack: true }),
  format.splat(),
  format.printf(({ timestamp, level, message, stack }) => {
    const base = `${timestamp} [${level.toUpperCase()}]: ${stack || message}`;
    return colorizer.colorize(level, base);
  })
);

const logger = createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  transports: [
    new transports.Console(),
    new transports.File({ filename: "logs/combined.log" }),
    new transports.File({ filename: "logs/error.log", level: "error" }),
  ],
  exceptionHandlers: [new transports.File({ filename: "logs/exceptions.log" })],
  rejectionHandlers: [new transports.File({ filename: "logs/rejections.log" })],
});

module.exports = { logger };

colorizer.addColors({
    info: "cyan",
    warn: "yellow",
    error: "magenta"
  });
