import commandLineArgs, { OptionDefinition } from "command-line-args";
import { logger } from "../logger";
import fs from "fs";
import path from "path";
import { statsReviver } from "../utils";
import { processSummarizedRunMeasurement } from "../utils/flowr-logic";
import assert from "assert";
import { globIterate } from "glob";
import readline from "readline";
import { UltimateSlicerStats } from "@eagleoutice/flowr/benchmark/summarizer/data";
import { Profile } from "../profile";
import { PathManager } from "../path-manager";
import { TimeManager } from "../time-manager";
import { getRepoInfo, RepoInfos } from "../utils/repo-info";
import { assertDirectory, iterateFilesInDir, readJsonFile } from "../utils/fs-helper";
import { buildFlowr, forkAsync } from "../utils/processes";
import { capitalize, flattenObject } from "../utils/output";

const runDefinitions: OptionDefinition[] = [{ name: "flowr-path", alias: "f", type: String }];

/**
 * Run the summarizer command.
 *
 * Expects the benchmark command to be run. The results of the benchmark are used as input.
 * Runs the summarizer for each config. Stores the results in the output directory.
 */
export async function runSummarizer(
    argv: string[],
    profile: Profile,
    pathManager: PathManager,
    timeManager: TimeManager,
    skipBuild = false,
) {
    const options = commandLineArgs(runDefinitions, { argv, stopAtFirstUnknown: true });
    logger.debug(`Parsed options: ${JSON.stringify(options)}`);

    timeManager.start("summarizer-full");

    const flowrPathRaw = options["flowr-path"];
    const doesFlowrPathExist = assertDirectory(
        flowrPathRaw,
        "The path to the flowr repo is required. Use the --flowr-path option.",
    );
    if (!doesFlowrPathExist) {
        return;
    }
    const flowrPath = path.resolve(flowrPathRaw);

    // Check whether repo info is consistent to assure correctness
    const repoInfo = await getRepoInfo(flowrPath);
    const { flowr } = readJsonFile<RepoInfos>(pathManager.getPath("repo-info"));
    assert.deepStrictEqual(
        repoInfo,
        flowr,
        "The flowr repo info is not consistent. Please rerun the benchmark command.",
    );

    if (!skipBuild) {
        timeManager.start("build-flowr");
        await buildFlowr(flowrPath, pathManager.getPath("build-flowr-log"));
        timeManager.stop("build-flowr");
    }

    const summarizerPath = path.join(flowrPath, "dist/src/cli/summarizer-app");

    // Run the summarizer for each config
    const summarizerProcesses: Promise<void>[] = [];
    for (const config of profile.configs) {
        const outputPath = pathManager.getConfigOutputPath(config.name, "summarizer");
        const logPath = pathManager.getConfigLogPath(config.name, "summarizer");

        const args = [
            "-i",
            pathManager.getConfigOutputPath(config.name, "benchmark"),
            "-o",
            outputPath,
        ];
        logger.verbose(`Summarizer args for config '${config.name}': ${args.join(" ")}`);

        timeManager.start(`summarizer-${config.name}`);

        summarizerProcesses.push(
            forkAsync(summarizerPath, args, logPath)
                .then(() => summarizeRunsPerFile(outputPath))
                .then(async () => await writeSummariesToCsv(outputPath))
                .then(() => timeManager.stop(`summarizer-${config.name}`)),
        );
    }

    await Promise.all(summarizerProcesses);

    timeManager.stop("summarizer-full");
}

function summarizeRunsPerFile(dir: string) {
    const runsPerFile = new Map<string, string[]>();
    iterateFilesInDir(dir, (dirPath, fileName) => {
        if (fileName.endsWith(".json")) {
            if (!runsPerFile.has(dirPath)) {
                runsPerFile.set(dirPath, []);
            }
            runsPerFile.get(dirPath)?.push(path.join(dirPath, fileName));
        }
    });

    for (const [summaryPath, runFiles] of runsPerFile) {
        processSummarizedRunMeasurement(
            summaryPath,
            runFiles,
            path.join(summaryPath, "summary-per-file.json"),
        );
    }
}

async function writeSummariesToCsv(basePath: string) {
    const csvPath = path.join(basePath, "summary.csv");
    const csvStream = fs.createWriteStream(csvPath);
    let isInitialLine = true;
    for await (const file of globIterate(`${basePath}/**/summary-per-file.json`, {
        absolute: true,
    })) {
        const rl = readline.createInterface({
            input: fs.createReadStream(file, "utf-8"),
            terminal: false,
        });
        for await (const line of rl) {
            const summary = JSON.parse(line, statsReviver) as UltimateSlicerStats;
            const flattenedData = flattenObject(summary).map(([key, value]) => ({
                key: key.map(capitalize).join(""),
                value,
            }));
            if (isInitialLine) {
                csvStream.write(`file,${flattenedData.map((d) => d.key).join(",")}\n`);
                isInitialLine = false;
            }
            const fileName = path
                .relative(basePath, file)
                .replace(`${path.sep}summary-per-file.json`, "");
            csvStream.write(`${fileName},${flattenedData.map((d) => d.value).join(",")}\n`);
        }
    }
    csvStream.end();
    csvStream.close();
}
