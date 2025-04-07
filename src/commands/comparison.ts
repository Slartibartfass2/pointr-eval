import commandLineArgs, { OptionDefinition } from "command-line-args";
import { logger } from "../logger";
import path from "path";
import { readUltimateStats, writeUltimateStats } from "../utils";
import { createUltimateEvalStats } from "../utils/flowr-logic";
import { Profile, RunConfig, runForConfigCombinations } from "../profile";
import { PathManager } from "../path-manager";
import { TimeManager } from "../time-manager";
import { ensureFileDirectoryExists, onFilesInPaths, writeJsonFile } from "../utils/fs-helper";
import { summarizeErrors } from "../utils/errors";
import { generateOutput } from "../utils/output";

const runDefinitions: OptionDefinition[] = [
    { name: "generate-output", type: Boolean, defaultValue: true },
];

/**
 * Run the comparison command.
 *
 * Expects the summarizer command to be run.
 * Compares the summaries of all configs.
 */
export async function runComparison(
    argv: string[],
    profile: Profile,
    pathManager: PathManager,
    timeManager: TimeManager,
) {
    const options = commandLineArgs(runDefinitions, { argv, stopAtFirstUnknown: true });
    logger.debug(`Parsed options: ${JSON.stringify(options)}`);

    timeManager.start("comparison-full");

    // Run file-by-file comparison if enabled
    if (profile.perFileComparison) {
        timeManager.start("comparison-file-by-file");
        runForConfigCombinations(profile, (configA, configB) =>
            comparePerFile(configA, configB, pathManager),
        );
        timeManager.stop("comparison-file-by-file");
    }

    // Run ultimate comparison if there are multiple configs
    if (profile.configs.length > 1) {
        timeManager.start("comparison-ultimate");
        runForConfigCombinations(profile, (configA, configB) => {
            const configAPath = pathManager.getUltimateSummaryPath(configA.name);
            const configBPath = pathManager.getUltimateSummaryPath(configB.name);
            const comparison = createUltimateEvalStats(
                configA.name,
                readUltimateStats(configAPath),
                configB.name,
                readUltimateStats(configBPath),
            );
            const outputPath = pathManager.getComparisonEvalStatsPath(configA.name, configB.name);
            writeUltimateStats(comparison, outputPath);
        });
        timeManager.stop("comparison-ultimate");
    }

    // Analyze log files for errors
    timeManager.start("error-analysis");
    const errorSummaries = await Promise.all(
        profile.configs.map(async (config) => {
            const logPath = pathManager.getConfigLogPath(config.name, "benchmark");
            const summary = await summarizeErrors(logPath);
            return [config.name, summary] as const;
        }),
    );
    const errors = {};
    for (const [configName, summary] of errorSummaries) {
        errors[configName] = summary;
    }
    writeJsonFile(pathManager.getPath("error-summary"), errors);
    timeManager.stop("error-analysis");

    timeManager.stop("comparison-full");

    if (options["generate-output"]) {
        generateOutput(profile, pathManager, timeManager);
    }
}

function comparePerFile(configA: RunConfig, configB: RunConfig, pathManager: PathManager) {
    const basePath = pathManager.getComparisonOutputPath(configA.name, configB.name);
    const configAPath = pathManager.getConfigOutputPath(configA.name, "summarizer");
    const configBPath = pathManager.getConfigOutputPath(configB.name, "summarizer");

    onFilesInPaths(
        [configAPath, configBPath],
        (fileName) => fileName === "summary-per-file.json",
        (dir, [pathA, pathB]) => {
            const statsA = readUltimateStats(pathA);
            const statsB = readUltimateStats(pathB);
            const comparison = createUltimateEvalStats(configA.name, statsA, configB.name, statsB);

            const outputPath = path.join(basePath, "per-file", dir, "compare.json");
            ensureFileDirectoryExists(outputPath);
            writeUltimateStats(comparison, outputPath);
        },
        "onFilesInAllPaths",
    );
}
