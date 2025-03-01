import * as winston from "winston";
import { Command } from "./cli";
import { currentISODate } from "./utils";

export const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(winston.format.colorize(), winston.format.cli()),
        }),
        new winston.transports.File({ filename: "pointr-eval.log" }),
        new winston.transports.File({ filename: "error.log", level: "error" }),
    ],
});

export function logStart(command: Command) {
    logger.info(`Starting pointr-${command} - ${currentISODate()}`);
}

export function logEnd(command: Command) {
    logger.info(`Finished pointr-${command} - ${currentISODate()}`);
}
