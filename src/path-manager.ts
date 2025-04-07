import path from "path";
import { Profile } from "./profile";
import { ensureDirectoryExists, ensureFileExists } from "./utils/fs-helper";

interface ConfigPaths {
    basePath: string;
    benchmarkOutputPath: string;
    benchmarkLogPath: string;
    summarizerOutputPath: string;
    summarizerLogPath: string;
}

export type ConfigPathType = "benchmark" | "summarizer";
export type SinglePathType =
    | "benchmark-input"
    | "build-flowr-log"
    | "discover-output"
    | "discover-stats"
    | "comparison-output"
    | "repo-info"
    | "output"
    | "error-summary";

export class PathManager {
    private profile: Profile;
    private configPaths: Map<string, ConfigPaths> = new Map();
    private singlePaths: Map<SinglePathType, string> = new Map();

    constructor(profile: Profile) {
        this.profile = profile;
    }

    setupPaths(outputPath: string) {
        if (this.profile.configs.length === 0) {
            throw new Error("No configs found in the selected profile");
        }

        if (this.profile.configs.length === 1) {
            this.configPaths.set("default", {
                basePath: outputPath,
                benchmarkOutputPath: path.join(outputPath, "benchmark"),
                benchmarkLogPath: path.join(outputPath, "benchmark.log"),
                summarizerOutputPath: path.join(outputPath, "summary"),
                summarizerLogPath: path.join(outputPath, "summary.log"),
            });
        } else {
            for (const config of this.profile.configs) {
                const basePath = path.join(outputPath, config.name);
                this.configPaths.set(config.name, {
                    basePath,
                    benchmarkOutputPath: path.join(basePath, "benchmark"),
                    benchmarkLogPath: path.join(outputPath, `benchmark-${config.name}.log`),
                    summarizerOutputPath: path.join(basePath, "summary"),
                    summarizerLogPath: path.join(outputPath, `summary-${config.name}.log`),
                });
            }
        }

        for (const configPaths of this.configPaths.values()) {
            ensureDirectoryExists(configPaths.benchmarkOutputPath);
            ensureDirectoryExists(configPaths.summarizerOutputPath);
            ensureFileExists(configPaths.benchmarkLogPath);
            ensureFileExists(configPaths.summarizerLogPath);
        }

        this.setSingleFilePath(outputPath, "benchmark-input", "benchmark-input.json");
        this.setSingleFilePath(outputPath, "build-flowr-log", "build-flowr.log");
        this.setSingleFilePath(outputPath, "discover-output", "discover-output.json");
        this.setSingleFilePath(outputPath, "discover-stats", "discover-stats.json");
        this.setSingleFilePath(outputPath, "repo-info", "repo-info.json");
        if (this.profile.configs.length > 1) {
            this.setSingleDirectoryPath(outputPath, "comparison-output", "comparison");
        }
        this.setSingleFilePath(outputPath, "output", "output.json");
        this.setSingleFilePath(outputPath, "error-summary", "errors.json");
    }

    private setSingleFilePath(outputPath: string, type: SinglePathType, filePath: string) {
        const fullPath = path.join(outputPath, filePath);
        ensureFileExists(fullPath);
        this.singlePaths.set(type, fullPath);
    }

    private setSingleDirectoryPath(
        outputPath: string,
        type: SinglePathType,
        directoryPath: string,
    ) {
        const fullPath = path.join(outputPath, directoryPath);
        ensureDirectoryExists(fullPath);
        this.singlePaths.set(type, fullPath);
    }

    getConfigLogPath(configName: string, type: ConfigPathType): string {
        const configPaths = this.configPaths.get(configName);
        if (!configPaths) {
            throw new Error(`Config ${configName} not found`);
        }

        return type === "benchmark" ? configPaths.benchmarkLogPath : configPaths.summarizerLogPath;
    }

    getConfigOutputPath(configName: string, type: ConfigPathType): string {
        const configPaths = this.configPaths.get(configName);
        if (!configPaths) {
            throw new Error(`Config ${configName} not found`);
        }

        return type === "benchmark"
            ? configPaths.benchmarkOutputPath
            : configPaths.summarizerOutputPath;
    }

    getAllConfigOutputPaths(type: ConfigPathType): { config: string; path: string }[] {
        const paths: { config: string; path: string }[] = [];
        for (const [configName, configPaths] of this.configPaths.entries()) {
            const path =
                type === "benchmark"
                    ? configPaths.benchmarkOutputPath
                    : configPaths.summarizerOutputPath;
            paths.push({ config: configName, path });
        }
        return paths;
    }

    getUltimateSummaryPath(configName: string): string {
        const configPaths = this.configPaths.get(configName);
        if (!configPaths) {
            throw new Error(`Config ${configName} not found`);
        }

        return path.join(configPaths.basePath, "summary-ultimate.json");
    }

    getPath(type: SinglePathType): string {
        const path = this.singlePaths.get(type);
        if (!path) {
            throw new Error(`Path ${type} not found`);
        }
        return path;
    }

    getComparisonOutputPath(configNameA: string, configNameB: string): string {
        const directoryPath = this.singlePaths.get("comparison-output");
        if (!directoryPath) {
            throw new Error(`Path comparison-output not found`);
        }

        if (this.profile.configs.length <= 2) {
            return path.join(directoryPath);
        } else {
            return path.join(directoryPath, `${configNameA}-${configNameB}`);
        }
    }

    getComparisonEvalStatsPath(configNameA: string, configNameB: string): string {
        return path.join(this.getComparisonOutputPath(configNameA, configNameB), "eval-stats.json");
    }
}
