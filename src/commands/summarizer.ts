import commandLineArgs, { OptionDefinition } from "command-line-args";
import { logEnd, logger, logStart } from "../logger";
import fs from "fs";
import path from "path";
import { assertDirectory, buildFlowr, currentISODate, forkAsync } from "../utils";

/**
 * Run the summarizer command.
 *
 * Expects the benchmark command to be run. The results of the benchmark are used as input.
 * Runs the summarizer for the field-sensitive and field-insensitive analyses.
 * Stores the results in the `results-path` directory.
 */
export async function runSummarizer(argv: string[], skipBuild = false) {
    const runDefinitions: OptionDefinition[] = [
        { name: "results-path", alias: "i", type: String, defaultValue: "./results" },
        { name: "flowr-path", alias: "f", type: String },
    ];
    const options = commandLineArgs(runDefinitions, { argv, stopAtFirstUnknown: true });
    logger.debug(`Parsed options: ${JSON.stringify(options)}`);

    logStart("summarizer");

    const resultsPath = path.resolve(options["results-path"]);
    const flowrPathRaw = options["flowr-path"];

    const doesResultsPathExist = assertDirectory(
        resultsPath,
        "The path to the results directory is required. Use the --results-path option.",
    );
    if (!doesResultsPathExist) {
        return;
    }

    const doesFlowrPathExist = assertDirectory(
        flowrPathRaw,
        "The path to the flowr repo is required. Use the --flowr-path option.",
    );
    if (!doesFlowrPathExist) {
        return;
    }

    const flowrPath = path.resolve(flowrPathRaw);

    logger.info(`Storing the results in ${resultsPath}`);

    const sensBenchPath = path.join(resultsPath, "sens", "bench");
    const insensBenchPath = path.join(resultsPath, "insens", "bench");

    // Create output directories
    const sensPath = path.join(resultsPath, "sens", "summary");
    fs.mkdirSync(sensPath, { recursive: true });
    const insensPath = path.join(resultsPath, "insens", "summary");
    fs.mkdirSync(insensPath, { recursive: true });

    const logSensPath = path.join(resultsPath, "summary-sens.log");
    fs.writeFileSync(logSensPath, "");
    const logInsensPath = path.join(resultsPath, "summary-insens.log");
    fs.writeFileSync(logInsensPath, "");

    const summarizerPath = path.join(flowrPath, "dist/src/cli/summarizer-app");
    const baseArgs = [];
    const sensArgs = [...baseArgs, "-i", sensBenchPath, "-o", sensPath];
    const insensArgs = [...baseArgs, "-i", insensBenchPath, "-o", insensPath];

    if (!skipBuild) {
        await buildFlowr(flowrPath, resultsPath);
    }

    // Run the summarizer
    logger.info(`Running the summarizer for result with pointer analysis - ${currentISODate()}`);
    const sensProc = forkAsync(summarizerPath, sensArgs, logSensPath).then(() => {
        logger.info(
            `Finished the summarizer for result with pointer analysis - ${currentISODate()}`,
        );
    });

    logger.info(`Running the summarizer for result without pointer analysis - ${currentISODate()}`);
    const insensProc = forkAsync(summarizerPath, insensArgs, logInsensPath).then(() => {
        logger.info(
            `Finished the summarizer for result without pointer analysis - ${currentISODate()}`,
        );
    });

    await Promise.all([sensProc, insensProc]);

    logEnd("summarizer");
}
