import fs from "fs";
import { logger } from "./logger";
import path from "path";
import { readJsonFile, writeJsonFile } from "./utils/fs-helper";

export interface TimeMeasurement {
    start: bigint;
    end?: bigint;
}

export type TimeEntryWithoutConfig =
    | "discover"
    | "build-flowr"
    | "comparison-full"
    | "full"
    | "comparison-file-by-file"
    | "comparison-ultimate"
    | "benchmark-cleanup"
    | "benchmark-full"
    | "summarizer-full"
    | "error-analysis";
export type TimeEntryWithConfigType = "benchmark" | "summarizer";
export type TimeEntryWithConfig = `${TimeEntryWithConfigType}-${string}`;
export type TimeEntry = TimeEntryWithoutConfig | TimeEntryWithConfig;

export class TimeManager {
    private times: Map<TimeEntry, TimeMeasurement> = new Map();
    outputPath: string;

    constructor(outputPath: string) {
        this.outputPath = path.join(outputPath, "times.json");
        this.init();
    }

    start(name: TimeEntry) {
        if (this.times.has(name)) {
            throw new Error(`Time measurement for ${name} already started`);
        }

        this.times.set(name, { start: process.hrtime.bigint() });
        logger.info(`Started ${name} - ${this.currentISODate()}`);
    }

    stop(name: TimeEntry) {
        const time = this.times.get(name);
        if (!time) {
            throw new Error(`No time measurement found for ${name}`);
        }

        time.end = process.hrtime.bigint();
        logger.info(`Finished ${name} - ${this.currentISODate()}`);
        this.writeToFile();
    }

    private init() {
        if (!fs.existsSync(this.outputPath)) {
            writeJsonFile(this.outputPath, []);
        } else {
            this.readFromFile();
        }
    }

    readFromFile() {
        try {
            this.times = readJsonFile(this.outputPath, this.reviver)["timeMap"];
        } catch (error) {
            logger.error(`Error reading time measurement from file: ${error}`);
        }
    }

    writeToFile() {
        try {
            writeJsonFile(this.outputPath, this.times, this.replacer);
        } catch (error) {
            logger.error(`Error writing time measurements to file: ${error}`);
        }
    }

    private currentISODate(): string {
        return new Date().toISOString();
    }

    private replacer(key: unknown, value: unknown): unknown {
        if (value instanceof Map) {
            const obj = {};
            for (const [k, v] of value.entries()) {
                obj[k] = v;
            }
            return { timeMap: obj };
        } else if (typeof value === "bigint") {
            return `${value.toString()}n`;
        } else {
            return value;
        }
    }

    private reviver(key: string, value: unknown): unknown {
        if (key === "timeMap") {
            const map = new Map<string, TimeMeasurement>();
            for (const [k, v] of Object.entries(value)) {
                map.set(k, v as TimeMeasurement);
            }
            return map;
        } else if (typeof value === "string" && value.endsWith("n")) {
            const numString = value.slice(0, -1);
            if (!numString.match(/^\d+$/)) {
                return value;
            } else {
                return BigInt(numString);
            }
        } else {
            return value;
        }
    }

    entriesToObject(): Record<string, TimeMeasurement> {
        const obj: Record<string, TimeMeasurement> = {};
        for (const [key, value] of this.times.entries()) {
            obj[key] = value;
        }
        return obj;
    }
}
