import commandLineArgs from "command-line-args";
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
import { FLOWR_PATH_FLAG, fullOptions, SOURCE_PATH_FLAG } from "../options";

export async function runFull(
    argv: string[],
    profile: Profile,
    pathManager: PathManager,
    timeManager: TimeManager,
) {
    const options = commandLineArgs(fullOptions, { argv, stopAtFirstUnknown: true });
    logger.debug(`Parsed options: ${JSON.stringify(options)}`);

    if (!options["skip-discover"]) {
        assert(
            options[SOURCE_PATH_FLAG],
            `If skip-discover is not set, '${SOURCE_PATH_FLAG}'  must be provided`,
        );
    }

    timeManager.start("full");

    // logger.info(`Deleting contents of ${outputPath}`);
    // fs.rmSync(outputPath, { recursive: true, force: true });
    // fs.mkdirSync(outputPath);

    if (!options["skip-discover"]) {
        await runDiscover(
            [`--${SOURCE_PATH_FLAG}`, options[SOURCE_PATH_FLAG]],
            pathManager,
            timeManager,
        );
    }

    await runBenchmark(
        [
            `--${FLOWR_PATH_FLAG}`,
            options[FLOWR_PATH_FLAG],
            ...(options.limit ? ["--limit", options.limit] : []),
        ],
        profile,
        pathManager,
        timeManager,
    );

    await runSummarizer(
        [`--${FLOWR_PATH_FLAG}`, options[FLOWR_PATH_FLAG]],
        profile,
        pathManager,
        timeManager,
        true,
    );

    await runComparison(["--generate-output", "false"], profile, pathManager, timeManager);

    timeManager.stop("full");

    generateOutput(profile, pathManager, timeManager);
}
