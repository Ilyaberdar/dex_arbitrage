import dotenv from "dotenv";
import winston from "winston";

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

export const logger = createLogger({
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

colorizer.addColors({
    info: "cyan",
    warn: "yellow",
    error: "magenta"
  });

//https://etherscan.io/address/0xa69babef1ca67a37ffaf7a485dfff3382056e78c
//https://etherscan.io/tx/0x8d493484534bbf76a140447d3f7f0bf9b61cf21d1c798709d1c8767b6fe9aa3d