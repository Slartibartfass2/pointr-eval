import commandLineArgs, { CommandLineOptions, OptionDefinition } from "command-line-args";
import { logger } from "./logger";
import { runComparison } from "./commands/comparison";
import { runBenchmark } from "./commands/benchmark";
import { runDiscover } from "./commands/discover";
import { runSummarizer } from "./commands/summarizer";
import { runFull } from "./commands/full";
import { getProfiles, Profile } from "./profile";
import { PathManager } from "./path-manager";
import { TimeManager } from "./time-manager";
import { ensureDirectoryExists, isDirectoryEmpty } from "./utils/fs-helper";
import path from "path";
import fs from "fs";

const optionDefinitions: OptionDefinition[] = [
    { name: "name", defaultOption: true, type: String },
    { name: "verbose", alias: "v", type: Boolean },
    { name: "debug", alias: "d", type: Boolean },
    { name: "profile", alias: "p", type: String },
    { name: "output-path", alias: "o", type: String, defaultValue: "./results" },
    { name: "force", type: Boolean },
];

export type Command = "comparison" | "benchmark" | "discover" | "summarizer" | "full";
const supportedCommands = ["comparison", "benchmark", "discover", "summarizer", "full"];
const isSupportedCommand = (command: string) => supportedCommands.includes(command);

export class Cli {
    parsedOptions: CommandLineOptions;
    argv: string[];

    constructor() {
        this.parsedOptions = commandLineArgs(optionDefinitions, { stopAtFirstUnknown: true });
        this.argv = this.parsedOptions._unknown || [];

        if (this.parsedOptions.debug) {
            logger.level = "debug";
        } else if (this.parsedOptions.verbose) {
            logger.level = "verbose";
        }

        logger.debug(`Parsed options: ${JSON.stringify(this.parsedOptions)}`);
    }

    async run() {
        if (!isSupportedCommand(this.parsedOptions.name)) {
            if (this.parsedOptions.name) {
                logger.error(`Unsupported command: ${this.parsedOptions.name}.`);
            } else {
                logger.error("No command specified.");
            }
            logger.error(`Supported commands: ${JSON.stringify(supportedCommands)}`);
            logger.error("Exiting.");
            return;
        }

        let profile: Profile | undefined;
        if (this.parsedOptions.profile) {
            const profiles = getProfiles();
            profile = profiles.find((p) => p.name === this.parsedOptions.profile);
            if (!profile) {
                logger.error(`Profile ${this.parsedOptions.profile} not found.`);
                return;
            }
        } else {
            logger.error("Please specify a profile with --profile.");
            return;
        }

        const outputPath = path.resolve(this.parsedOptions["output-path"]);
        if (!fs.existsSync(outputPath)) {
            ensureDirectoryExists(outputPath);
        }
        if (!isDirectoryEmpty(outputPath)) {
            if (this.parsedOptions.force) {
                fs.rmSync(outputPath, { recursive: true, force: true });
            } else {
                logger.error(
                    `Output path ${outputPath} is not empty. Please specify a different path or use --force to overwrite.`,
                );
                return;
            }
        }

        const pathManager = new PathManager(profile);
        pathManager.setupPaths(outputPath);
        const timeManager = new TimeManager(outputPath);

        if (this.parsedOptions.name === "discover") {
            await runDiscover(this.argv, profile, pathManager, timeManager);
        } else if (this.parsedOptions.name === "benchmark") {
            await runBenchmark(this.argv, profile, pathManager, timeManager);
        } else if (this.parsedOptions.name === "summarizer") {
            await runSummarizer(this.argv, profile, pathManager, timeManager);
        } else if (this.parsedOptions.name === "comparison") {
            await runComparison(this.argv, profile, pathManager, timeManager);
        } else if (this.parsedOptions.name === "full") {
            await runFull(this.argv, profile, pathManager, timeManager);
        }
    }
}
