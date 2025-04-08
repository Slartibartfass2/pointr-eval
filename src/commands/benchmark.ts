import commandLineArgs, { OptionDefinition } from "command-line-args";
import { logger } from "../logger";
import fs from "fs";
import path from "path";
import { DiscoverData } from "../model/discover-data";
import { Profile } from "../profile";
import { PathManager } from "../path-manager";
import { TimeManager } from "../time-manager";
import { assertDirectory, onFilesInPaths, readJsonFile, writeJsonFile } from "../utils/fs-helper";
import { getRepoInfo, RepoInfos } from "../utils/repo-info";
import { buildFlowr, forkAsync } from "../utils/processes";

const runDefinitions: OptionDefinition[] = [
    { name: "flowr-path", alias: "f", type: String },
    { name: "limit", alias: "l", type: String },
];

/**
 * Run the benchmark command.
 *
 * Expects the flowr repo to be cloned and its path provided.
 * Expects the input file to be a JSON file with the paths of the files to analyze (Result of the discover command).
 * Runs the benchmark for each config. Stores the results in the output directory.
 */
export async function runBenchmark(
    argv: string[],
    profile: Profile,
    pathManager: PathManager,
    timeManager: TimeManager,
) {
    const options = commandLineArgs(runDefinitions, { argv, stopAtFirstUnknown: true });
    logger.debug(`Parsed options: ${JSON.stringify(options)}`);

    timeManager.start("benchmark-full");

    // Assure that the flowr path exists
    const flowrPathRaw = options["flowr-path"];
    const doesFlowrPathExist = assertDirectory(
        flowrPathRaw,
        "The path to the flowr repo is required. Use the --flowr-path option.",
    );
    if (!doesFlowrPathExist) {
        return;
    }
    const flowrPath = path.resolve(flowrPathRaw);

    // Read files from the discover step
    const discoverData = readJsonFile<DiscoverData>(pathManager.getPath("discover-output"));
    logger.verbose(
        `Using discover data with ${discoverData.files.length} files, ${discoverData.binaryFiles.length} binary files, ${discoverData.emptyFiles.length} empty files, ${discoverData.nonCodeFiles.length} non-code files, and ${discoverData.numberOfSourcingFiles} sourcing files`,
    );

    // Write discover data to the output directory to have all at one place
    const benchmarkInputFiles = discoverData.files.slice(0, options.limit).map((f) => f.path);
    writeJsonFile(pathManager.getPath("benchmark-input"), benchmarkInputFiles);

    if (options.limit) {
        logger.warn(`Limiting the number of files to ${options.limit}`);
    }

    // Write repo infos to output directory
    const flowrRepoInfo = await getRepoInfo(flowrPath);
    logger.verbose(`flowr repo info: ${JSON.stringify(flowrRepoInfo)}`);
    const pointrEvalInfo = await getRepoInfo(process.cwd());
    logger.verbose(`pointr-eval repo info: ${JSON.stringify(pointrEvalInfo)}`);
    const repoInfos = readJsonFile<RepoInfos>(pathManager.getPath("repo-info"));
    repoInfos.flowr = flowrRepoInfo;
    repoInfos.pointrEval = pointrEvalInfo;
    writeJsonFile(pathManager.getPath("repo-info"), repoInfos);

    timeManager.start("build-flowr");
    await buildFlowr(flowrPath, pathManager.getPath("build-flowr-log"));
    timeManager.stop("build-flowr");

    const benchmarkPath = path.join(flowrPath, "dist/src/cli/benchmark-app");
    const baseArgs = ["-i", pathManager.getPath("benchmark-input"), ...profile.benchmarkArgs];

    // Run the benchmark for each config
    for (const config of profile.configs) {
        const configResultsPath = pathManager.getConfigOutputPath(config.name, "benchmark");
        const logPath = pathManager.getConfigLogPath(config.name, "benchmark");

        const args = [...baseArgs, ...config.benchmarkArgs, "-o", configResultsPath];
        logger.verbose(`Benchmark args for config '${config.name}': ${args.join(" ")}`);

        // Run benchmark with config
        timeManager.start(`benchmark-${config.name}`);
        await forkAsync(benchmarkPath, args, logPath).then(() => {
            timeManager.stop(`benchmark-${config.name}`);
        });
    }

    // Delete results which aren't in all results
    if (profile.configs.length > 1) {
        timeManager.start("benchmark-cleanup");
        removeUniqueFiles(pathManager);
        timeManager.stop("benchmark-cleanup");
    }

    timeManager.stop("benchmark-full");
}

/**
 * Remove files which are unique to one of the runs.
 *
 * This is needed because the benchmark app does not remove files which are not in all runs.
 * This function removes files which are not in all runs.
 *
 * @param pathManager - The path manager
 */
function removeUniqueFiles(pathManager: PathManager) {
    const allConfigOutputPaths = pathManager.getAllConfigOutputPaths("benchmark");
    const removedFiles = new Map<string, number>();

    const { notInAll } = onFilesInPaths(
        allConfigOutputPaths.map((config) => config.path),
        (fileName) => fileName.endsWith(".json"),
        (_, filteredPaths) => {
            for (const path of filteredPaths) {
                fs.rmSync(path);
                removedFiles.set(path, (removedFiles.get(path) ?? 0) + 1);
            }
        },
        "onFilesInSinglePath",
    );

    const logs = [];
    const counts = removedFiles.values().toArray();
    for (let i = 0; i < removedFiles.size; i++) {
        const removedFilesCount = counts[i];
        logs.push(`- ${allConfigOutputPaths[i].config}: ${removedFilesCount} files`);
    }

    let log = `Removed ${notInAll} results which are not in all runs`;
    if (logs.length > 0) {
        log += `:\n${logs.join("\n")}`;
    }
    logger.verbose(log);
}
