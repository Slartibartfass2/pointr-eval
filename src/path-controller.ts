import path from "path";
import { Profile } from "./profile";
import fs from "fs";

interface ConfigPaths {
    benchmarkPath: string;
    benchmarkLogPath: string;
    summarizerPath: string;
    summarizerLogPath: string;
}

export class PathManager {
    private profile: Profile;
    private configPaths: Map<string, ConfigPaths> = new Map();

    constructor(profile: Profile) {
        this.profile = profile;
    }

    setupPaths(outputPath: string) {
        if (this.profile.configs.length === 1) {
            this.configPaths.set("default", {
                benchmarkPath: path.join(outputPath, "benchmark"),
                benchmarkLogPath: path.join(outputPath, "benchmark.log"),
                summarizerPath: path.join(outputPath, "summary"),
                summarizerLogPath: path.join(outputPath, "summary.log"),
            });
        } else {
            for (const config of this.profile.configs) {
                this.configPaths.set(config.name, {
                    benchmarkPath: path.join(outputPath, config.name, "benchmark"),
                    benchmarkLogPath: path.join(outputPath, `benchmark-${config.name}.log`),
                    summarizerPath: path.join(outputPath, config.name, "summary"),
                    summarizerLogPath: path.join(outputPath, `summary-${config.name}.log`),
                });
            }
        }

        for (const configPaths of this.configPaths.values()) {
            fs.mkdirSync(configPaths.benchmarkPath, { recursive: true });
            fs.mkdirSync(configPaths.summarizerPath, { recursive: true });
            fs.writeFileSync(configPaths.benchmarkLogPath, "");
            fs.writeFileSync(configPaths.summarizerLogPath, "");
        }
    }

    getLogPath(configName: string, type: "benchmark" | "summarizer"): string {
        const configPaths = this.configPaths.get(configName);
        if (!configPaths) {
            throw new Error(`Config ${configName} not found`);
        }

        return type === "benchmark" ? configPaths.benchmarkLogPath : configPaths.summarizerLogPath;
    }

    getResultsPath(configName: string, type: "benchmark" | "summarizer"): string {
        const configPaths = this.configPaths.get(configName);
        if (!configPaths) {
            throw new Error(`Config ${configName} not found`);
        }

        return type === "benchmark" ? configPaths.benchmarkPath : configPaths.summarizerPath;
    }
}
