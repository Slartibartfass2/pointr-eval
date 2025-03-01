import commandLineArgs, { OptionDefinition } from "command-line-args";
import { logEnd, logger, logStart } from "../logger";
import fs from "fs";
import path from "path";
import {
    assertDirectory,
    assertFile,
    buildFlowr,
    currentISODate,
    ensureDirectoryExists,
    forkAsync,
} from "../utils";

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
    ];
    const options = commandLineArgs(runDefinitions, { argv, stopAtFirstUnknown: true });
    logger.debug(`Parsed options: ${JSON.stringify(options)}`);

    logStart("benchmark");

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

    const benchmarkPath = path.join(flowrPath, "dist/src/cli/benchmark-app");
    const baseArgs = [
        "--max-file-slices",
        "15",
        "--parser",
        "tree-sitter",
        "-i",
        filesPath,
        "-r", // runs
        "1",
        "-t", // threshold (default 75)
        "20",
    ];
    const sensArgs = [...baseArgs, "-o", sensPath, "--enable-pointer-tracking"];
    const insensArgs = [...baseArgs, "-o", insensPath];

    await buildFlowr(flowrPath, outputPath);

    // Run the benchmark
    logger.info(`Running the benchmark with pointer analysis - ${currentISODate()}`);
    const sensProc = forkAsync(benchmarkPath, sensArgs, logSensPath).then(() => {
        logger.info(`Finished the benchmark with pointer analysis - ${currentISODate()}`);
    });

    logger.info(`Running the benchmark without pointer analysis - ${currentISODate()}`);
    const insensProc = forkAsync(benchmarkPath, insensArgs, logInsensPath).then(() => {
        logger.info(`Finished the benchmark without pointer analysis - ${currentISODate()}`);
    });

    await Promise.all([sensProc, insensProc]);

    logEnd("benchmark");
}
