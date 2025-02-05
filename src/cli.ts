import commandLineArgs, { CommandLineOptions } from "command-line-args";
import { logger } from "./logger";
import { glob } from "glob";
import { FileProcessor } from "./file-processor";

const optionDefinitions = [
    { name: "verbose", alias: "v", type: Boolean },
    { name: "debug", alias: "d", type: Boolean },
    { name: "parallel", alias: "p", type: Boolean },
];

export class Cli {
    parsedOptions: CommandLineOptions;

    constructor() {
        this.parsedOptions = commandLineArgs(optionDefinitions);

        if (this.parsedOptions.verbose) {
            logger.level = "verbose";
        }

        if (this.parsedOptions.debug) {
            logger.level = "debug";
        }

        logger.debug(`Parsed options: ${JSON.stringify(this.parsedOptions)}`);
    }

    async run() {
        logger.info("Starting pointr-eval");

        // Processing all example files
        const files = await glob("examples/**/*.[r|R]");
        const totalFiles = files.length;
        logger.info(`Found ${totalFiles} files`);
        let processedFiles = 0;
        for (const file of files) {
            try {
                const processor = new FileProcessor(this.parsedOptions, file);
                if (this.parsedOptions.parallel) {
                    await processor.processFile();
                    processedFiles++;
                    logger.info(`Processed ${processedFiles}/${totalFiles}`);
                } else {
                    processor.processFile().then(() => {
                        processedFiles++;
                        logger.info(`Processed ${processedFiles}/${totalFiles}`);
                    });
                }
            } catch (error) {
                logger.error(`Error processing file ${file}. Error: ${error}. Skipping.`);
            }
        }

        logger.info("Finished pointr-eval");
    }
}
