import commandLineArgs, { OptionDefinition } from "command-line-args";
import { logEnd, logger, logStart } from "../logger";
import fs from "fs";
import path from "path";
import {
    assertDirectory,
    assertFile,
    buildFlowr,
    createRunTime,
    currentISODate,
    ensureDirectoryExists,
    forkAsync,
    getRepoInfo,
    onFilesInBothPaths,
    writeTime,
} from "../utils";
import { DiscoverData, BenchConfig, Times, RepoInfos } from "../model";

/**
 * Run the benchmark command.
 *
 * Expects the flowr repo to be cloned and its path provided.
 * Expects the input file to be a JSON file with the paths of the files to analyze (Result of the discover command).
 * Runs the benchmark with and without pointer analysis. Stores the results in the output directory.
 */
export async function runBenchmark(argv: string[]) {
    const runDefinitions: OptionDefinition[] = [
        { name: "files-path", alias: "i", type: String },
        { name: "flowr-path", alias: "f", type: String },
        { name: "output-path", alias: "o", type: String, defaultValue: "./results" },
        { name: "limit", alias: "l", type: String },
    ];
    const options = commandLineArgs(runDefinitions, { argv, stopAtFirstUnknown: true });
    logger.debug(`Parsed options: ${JSON.stringify(options)}`);

    logStart("benchmark");
    const startTime = Date.now();

    const filesPathRaw = options["files-path"];
    const flowrPathRaw = options["flowr-path"];

    const doesFilesPathExist = assertFile(
        filesPathRaw,
        "The path to the input file is required. Use the --files-path option.",
    );
    if (!doesFilesPathExist) {
        return;
    }

    const doesFlowrPathExist = assertDirectory(
        flowrPathRaw,
        "The path to the flowr repo is required. Use the --flowr-path option.",
    );
    if (!doesFlowrPathExist) {
        return;
    }

    const filesPath = path.resolve(filesPathRaw);
    const flowrPath = path.resolve(flowrPathRaw);

    const outputPath = path.resolve(options["output-path"]);
    ensureDirectoryExists(outputPath);

    logger.info(`Storing the results in ${outputPath}`);

    // Create output directories
    const sensPath = path.join(outputPath, "sens", "bench");
    fs.mkdirSync(sensPath, { recursive: true });
    const insensPath = path.join(outputPath, "insens", "bench");
    fs.mkdirSync(insensPath, { recursive: true });

    const logSensPath = path.join(outputPath, "bench-sens.log");
    fs.writeFileSync(logSensPath, "");
    const logInsensPath = path.join(outputPath, "bench-insens.log");
    fs.writeFileSync(logInsensPath, "");

    const discoverData = JSON.parse(fs.readFileSync(filesPath, "utf8")) as DiscoverData;
    logger.verbose(
        `Using discover data: repoInfo=${JSON.stringify(discoverData.repo)}, files=[${discoverData.files.length} R files]`,
    );

    // Write discover data to the output directory to have all at one place
    const benchFilesPath = path.join(outputPath, "bench-input.json");
    const benchFiles = discoverData.files.slice(0, options.limit).map((f) => f.path);
    fs.writeFileSync(benchFilesPath, JSON.stringify(benchFiles));

    if (options.limit) {
        logger.warn(`Limiting the number of files to ${options.limit}`);
    }

    // Write repo infos to output directory
    const flowrRepoInfo = await getRepoInfo(flowrPath);
    logger.verbose(`flowr repo info: ${JSON.stringify(flowrRepoInfo)}`);
    const pointrEvalInfo = await getRepoInfo(process.cwd());
    logger.verbose(`pointr-eval repo info: ${JSON.stringify(pointrEvalInfo)}`);
    const repoInfos: RepoInfos = {
        flowr: flowrRepoInfo,
        ssoc: discoverData.repo,
        ssocFileCount: discoverData.files.length,
        ssocBinaryFileCount: discoverData.binaryFiles.length,
        ssocEmptyFileCount: discoverData.emptyFiles.length,
        ssocNonCodeFileCount: discoverData.nonCodeFiles.length,
        ssocNumberOfSourcingFiles: discoverData.numberOfSourcingFiles,
        discoverSeed: discoverData.seed,
        pointrEval: pointrEvalInfo,
    };
    fs.writeFileSync(path.join(outputPath, "repo-info.json"), JSON.stringify(repoInfos));

    const benchmarkPath = path.join(flowrPath, "dist/src/cli/benchmark-app");
    const benchConfig: BenchConfig = {
        sliceSampling: 40,
        timeLimitInMinutes: 25,
        runs: 1,
        threshold: 20,
        samplingStrategy: "equidistant",
    };
    const baseArgs = [
        // "--max-file-slices",
        //"4230", // 99% of the files have less than 4231 slices
        "--parser",
        "tree-sitter",
        // "-l",
        // "3300", // file limit
        "-s",
        `${benchConfig.sliceSampling}`,
        "--sampling-strategy",
        benchConfig.samplingStrategy,
        "--per-file-time-limit",
        `${benchConfig.timeLimitInMinutes * 60000}`,
        "-i",
        benchFilesPath,
        "-r", // runs
        `${benchConfig.runs}`,
        "-t", // threshold (default 75)
        `${benchConfig.threshold}`,
    ];
    const sensArgs = [...baseArgs, "-o", sensPath, "--enable-pointer-tracking"];
    const insensArgs = [...baseArgs, "-o", insensPath];

    fs.writeFileSync(path.join(outputPath, "bench-config.json"), JSON.stringify(benchConfig));

    const startTimeBuild = Date.now();
    await buildFlowr(flowrPath, outputPath);
    const endTimeBuild = Date.now();

    // Run the benchmark
    logger.info(`Running the benchmark without pointer analysis - ${currentISODate()}`);
    logger.verbose(`Insensitive benchmark args: ${insensArgs.join(" ")}`);
    const insensStart = Date.now();
    let insensEnd: number;
    const insensProc = forkAsync(benchmarkPath, insensArgs, logInsensPath).then(() => {
        logger.info(`Finished the benchmark without pointer analysis - ${currentISODate()}`);
        insensEnd = Date.now();
    });

    // TODO: check whether this affects the benchmark results
    await insensProc;

    logger.info(`Running the benchmark with pointer analysis - ${currentISODate()}`);
    logger.verbose(`Sensitive benchmark args: ${sensArgs.join(" ")}`);
    const sensStart = Date.now();
    let sensEnd: number;
    const sensProc = forkAsync(benchmarkPath, sensArgs, logSensPath).then(() => {
        logger.info(`Finished the benchmark with pointer analysis - ${currentISODate()}`);
        sensEnd = Date.now();
    });

    await Promise.all([sensProc, insensProc]);

    // Delete results which aren't in both results
    logger.info(`Removing results which are not in both runs - ${currentISODate()}`);
    removeSingleFiles(insensPath, sensPath);
    logger.info(`Finished removing results which are not in both runs - ${currentISODate()}`);

    const endTime = Date.now();
    logEnd("benchmark");

    const time: Partial<Times> = {
        benchmark: {
            ...createRunTime(startTime, endTime),
            insens: createRunTime(insensStart, insensEnd),
            sens: createRunTime(sensStart, sensEnd),
        },
        build: createRunTime(startTimeBuild, endTimeBuild),
    };
    writeTime(time, outputPath);
}

function removeSingleFiles(insensPath: string, sensPath: string) {
    let insensRemoved = 0;
    let sensRemoved = 0;
    const { single } = onFilesInBothPaths(
        insensPath,
        sensPath,
        (fileName) => fileName.endsWith(".json"),
        (_, insensPath, sensPath) => {
            if (insensPath) {
                insensRemoved++;
                fs.rmSync(insensPath);
            }
            if (sensPath) {
                sensRemoved++;
                fs.rmSync(sensPath);
            }
        },
        "onFilesInSinglePath",
    );
    logger.verbose(
        `Removed ${single} results which are not in both runs (insens: ${insensRemoved}, sens: ${sensRemoved})`,
    );
}
