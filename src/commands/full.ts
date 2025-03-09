import commandLineArgs, { OptionDefinition } from "command-line-args";
import { logEnd, logger, logStart } from "../logger";
import { runBenchmark } from "./benchmark";
import { runSummarizer } from "./summarizer";
import { runEval } from "./evaluation";
import path from "path";
import { ensureDirectoryExists } from "../utils";
import fs from "fs";
import { runDiscover } from "./discover";

export async function runFull(argv: string[]) {
    const runDefinitions: OptionDefinition[] = [
        { name: "ssoc-path", alias: "i", type: String },
        { name: "flowr-path", alias: "f", type: String },
        { name: "output-path", alias: "o", type: String, defaultValue: "./results" },
    ];
    const options = commandLineArgs(runDefinitions, { argv, stopAtFirstUnknown: true });
    logger.debug(`Parsed options: ${JSON.stringify(options)}`);

    logStart("full");

    const outputPathRaw = options["output-path"];
    ensureDirectoryExists(outputPathRaw);
    const outputPath = path.resolve(outputPathRaw);

    logger.info(`Deleting contents of ${outputPath}`);
    fs.rmSync(outputPath, { recursive: true, force: true });
    fs.mkdirSync(outputPath);

    const filesPath = path.join(outputPath, "files.json");
    await runDiscover(["--ssoc-path", options["ssoc-path"], "--output-path", filesPath]);

    await runBenchmark([
        "--files-path",
        filesPath,
        "--flowr-path",
        options["flowr-path"],
        "--output-path",
        outputPath,
    ]);

    await runSummarizer(
        ["--results-path", outputPath, "--flowr-path", options["flowr-path"]],
        true,
    );

    await runEval(["--results-path", outputPath]);

    logEnd("full");
}
