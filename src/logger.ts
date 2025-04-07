import * as winston from "winston";

export const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(winston.format.colorize(), winston.format.cli()),
        }),
        new winston.transports.File({ filename: "pointr-eval.log", level: "verbose" }),
        new winston.transports.File({ filename: "error.log", level: "error" }),
    ],
});
