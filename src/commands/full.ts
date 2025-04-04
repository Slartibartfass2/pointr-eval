import commandLineArgs, { OptionDefinition } from "command-line-args";
import { logEnd, logger, logStart } from "../logger";
import { runBenchmark } from "./benchmark";
import { runSummarizer } from "./summarizer";
import { runEval } from "./evaluation";
import path from "path";
import {
    createRunTime,
    ensureDirectoryExists,
    flattenObject,
    objectToLaTeX,
    printTimes,
    reconstructObject,
    writeTime,
} from "../utils";
import fs from "fs";
import { runDiscover } from "./discover";
import assert from "assert";
import { Times } from "../model/model";
import { Profile } from "../profile";

export async function runFull(argv: string[], profile: Profile) {
    const runDefinitions: OptionDefinition[] = [
        { name: "ssoc-path", alias: "i", type: String },
        { name: "flowr-path", alias: "f", type: String },
        { name: "output-path", alias: "o", type: String, defaultValue: "./results" },
        { name: "skip-discover", type: Boolean, defaultValue: false },
        { name: "files-path", type: String },
        { name: "seed", alias: "s", type: String, defaultValue: "U2xhcnRpYmFydGZhc3My" },
        { name: "limit", alias: "l", type: String },
    ];
    const options = commandLineArgs(runDefinitions, { argv, stopAtFirstUnknown: true });
    logger.debug(`Parsed options: ${JSON.stringify(options)}`);

    if (options["skip-discover"]) {
        assert(options["files-path"], "If skip-discover is set, files-path must be provided");
    } else {
        assert(options["ssoc-path"], "If skip-discover is not set, ssoc-path must be provided");
    }

    logStart("full");
    const startTime = Date.now();

    const outputPathRaw = options["output-path"];
    ensureDirectoryExists(outputPathRaw);
    const outputPath = path.resolve(outputPathRaw);

    logger.info(`Deleting contents of ${outputPath}`);
    fs.rmSync(outputPath, { recursive: true, force: true });
    fs.mkdirSync(outputPath);

    const filesPath =
        (options["files-path"] as string | undefined) || path.join(outputPath, "files.json");
    if (!options["skip-discover"]) {
        await runDiscover([
            "--ssoc-path",
            options["ssoc-path"],
            "--output-path",
            filesPath,
            "--results-path",
            outputPath,
            "--seed",
            options.seed,
        ], profile);
    }

    await runBenchmark([
        "--files-path",
        filesPath,
        "--flowr-path",
        options["flowr-path"],
        "--output-path",
        outputPath,
        ...(options.limit ? ["--limit", options.limit] : []),
    ], profile);

    await runSummarizer(
        ["--results-path", outputPath, "--flowr-path", options["flowr-path"]],
        profile,
        true,
    );

    await runEval(["--results-path", outputPath], profile);

    const endTime = Date.now();
    logEnd("full");

    writeTime(
        {
            full: createRunTime(startTime, endTime),
        },
        outputPath,
    );

    const times = JSON.parse(fs.readFileSync(path.join(outputPath, "times.json"), "utf8")) as Times;
    printTimes(times);

    const filteredTimes = flattenObject(times).filter(([key]) => key.includes("durationInMs"));
    const latex = "\n" + objectToLaTeX({ times: reconstructObject(filteredTimes) });
    fs.appendFileSync(path.join(outputPath, "eval-stats.tex"), latex);
}
