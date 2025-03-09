import commandLineArgs, { OptionDefinition } from "command-line-args";
import { logEnd, logger, logStart } from "../logger";
import fs from "fs";
import path from "path";
import { assertDirectory, buildFlowr, currentISODate, forkAsync, getRepoInfo } from "../utils";
import { processSummarizedRunMeasurement } from "../flowr-logic";
import { RepoInfo } from "../model";
import assert from "assert";

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

    // Check whether repo info is consistent to assure correctness
    const repoInfo = await getRepoInfo(flowrPath);
    logger.verbose(`flowr repo info: ${JSON.stringify(repoInfo)}`);
    const benchRepoInfo = JSON.parse(
        fs.readFileSync(path.join(resultsPath, "repo-info.json"), "utf8"),
    ) as { flowr: RepoInfo };
    assert.deepStrictEqual(
        repoInfo,
        benchRepoInfo.flowr,
        "The flowr repo info does not match the benchmark repo info. This may lead to incorrect results.",
    );

    const summarizerPath = path.join(flowrPath, "dist/src/cli/summarizer-app");
    const baseArgs = [];
    const sensArgs = [...baseArgs, "-i", sensBenchPath, "-o", sensPath];
    const insensArgs = [...baseArgs, "-i", insensBenchPath, "-o", insensPath];

    if (!skipBuild) {
        await buildFlowr(flowrPath, resultsPath);
    }

    // Run the summarizer
    logger.info(`Running the summarizer for result without pointer analysis - ${currentISODate()}`);
    logger.verbose(`Insenstive summarizer args: ${insensArgs.join(" ")}`);
    const insensProc = forkAsync(summarizerPath, insensArgs, logInsensPath).then(() => {
        logger.info(
            `Finished the summarizer for result without pointer analysis - ${currentISODate()}`,
        );
    });

    logger.info(`Running the summarizer for result with pointer analysis - ${currentISODate()}`);
    logger.verbose(`Senstive summarizer args: ${sensArgs.join(" ")}`);
    const sensProc = forkAsync(summarizerPath, sensArgs, logSensPath).then(() => {
        logger.info(
            `Finished the summarizer for result with pointer analysis - ${currentISODate()}`,
        );
    });

    await Promise.all([sensProc, insensProc]);

    summarizeRunsPerFile(sensPath);
    summarizeRunsPerFile(insensPath);

    logEnd("summarizer");
}

function summarizeRunsPerFile(dir: string) {
    const dirEntries = fs.readdirSync(dir, { recursive: true, withFileTypes: true });
    const runsPerFile = new Map<string, string[]>();
    for (const dir of dirEntries) {
        const fileName = dir.name;
        const dirPath = dir.parentPath;

        if (dir.isFile() && fileName.endsWith(".json")) {
            if (!runsPerFile.has(dirPath)) {
                runsPerFile.set(dirPath, []);
            }
            runsPerFile.get(dirPath)?.push(path.join(dirPath, fileName));
        }
    }

    for (const [summaryPath, runFiles] of runsPerFile) {
        processSummarizedRunMeasurement(
            summaryPath,
            runFiles,
            path.join(summaryPath, "summary-per-file.json"),
        );
    }
}
