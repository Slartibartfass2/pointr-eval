import commandLineArgs, { OptionDefinition } from "command-line-args";
import { logger } from "../logger";
import { runBenchmark } from "./benchmark";
import { runSummarizer } from "./summarizer";
import { runDiscover } from "./discover";
import assert from "assert";
import { Profile } from "../profile";
import { PathManager } from "../path-manager";
import { TimeManager } from "../time-manager";
import { runComparison } from "./comparison";
import { generateOutput } from "../utils/output";

const runDefinitions: OptionDefinition[] = [
    { name: "ssoc-path", alias: "i", type: String },
    { name: "flowr-path", alias: "f", type: String },
    { name: "skip-discover", type: Boolean, defaultValue: false },
    { name: "limit", alias: "l", type: String },
];

export async function runFull(
    argv: string[],
    profile: Profile,
    pathManager: PathManager,
    timeManager: TimeManager,
) {
    const options = commandLineArgs(runDefinitions, { argv, stopAtFirstUnknown: true });
    logger.debug(`Parsed options: ${JSON.stringify(options)}`);

    if (!options["skip-discover"]) {
        assert(options["ssoc-path"], "If skip-discover is not set, ssoc-path must be provided");
    }

    timeManager.start("full");

    // logger.info(`Deleting contents of ${outputPath}`);
    // fs.rmSync(outputPath, { recursive: true, force: true });
    // fs.mkdirSync(outputPath);

    if (!options["skip-discover"]) {
        await runDiscover(["--ssoc-path", options["ssoc-path"]], pathManager, timeManager);
    }

    await runBenchmark(
        [
            "--flowr-path",
            options["flowr-path"],
            ...(options.limit ? ["--limit", options.limit] : []),
        ],
        profile,
        pathManager,
        timeManager,
    );

    await runSummarizer(
        ["--flowr-path", options["flowr-path"]],
        profile,
        pathManager,
        timeManager,
        true,
    );

    await runComparison(["--generate-output", "false"], profile, pathManager, timeManager);

    timeManager.stop("full");

    generateOutput(profile, pathManager, timeManager);
}
