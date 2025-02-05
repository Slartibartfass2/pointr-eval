import { Cli } from "./cli";
import { logger } from "./logger";

process.on("uncaughtException", (error: Error) => {
    logger.error(`Uncaught exception: ${error}`);
    if (error.stack) {
        logger.error(error.stack);
    }
    process.exit(1);
});

process.on("unhandledRejection", (error: Error) => {
    logger.error(`Promise rejection: ${error}`);
    if (error.stack) {
        logger.error(error.stack);
    }
    process.exit(1);
});

(async () => {
    const cli = new Cli();
    await cli.run();
})();
