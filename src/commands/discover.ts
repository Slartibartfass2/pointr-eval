import commandLineArgs, { OptionDefinition } from "command-line-args";
import { logEnd, logger, logStart } from "../logger";
import { globIterate } from "glob";
import fs from "fs";
import path from "path";
import { assertDirectory, ensureDirectoryExists, getRepoInfo } from "../utils";

/**
 * Run the discover command.
 *
 * Expects a 'source' directory at the provided path.
 * Discovers all files in the directory and its subdirectories.
 * Writes the paths of the discovered files to the output file.
 */
export async function runDiscover(argv: string[]) {
    const runDefinitions: OptionDefinition[] = [
        { name: "ssoc-path", alias: "i", type: String },
        { name: "output-path", alias: "o", type: String, defaultValue: "files.json" },
    ];
    const options = commandLineArgs(runDefinitions, { argv, stopAtFirstUnknown: true });
    logger.debug(`Parsed options: ${JSON.stringify(options)}`);

    logStart("discover");

    const ssocPath = options["ssoc-path"];

    const doesSsocPathExist = assertDirectory(
        ssocPath,
        "The path to the SSOC repo is required. Use the --ssoc-path option.",
    );
    if (!doesSsocPathExist) {
        return;
    }

    const outputPath = path.resolve(options["output-path"]);
    ensureDirectoryExists(outputPath);

    const repoInfo = await getRepoInfo(ssocPath);
    logger.verbose(`ssoc-data repo info: ${JSON.stringify(repoInfo)}`);

    // Write discovered paths to the output file
    fs.writeFileSync(outputPath, `{"repo":${JSON.stringify(repoInfo)},"files":[`);
    let fileCount = 0;
    for await (const file of globIterate(`${ssocPath}/sources/**/*.[r|R]`, { absolute: true })) {
        let normalizedFile = path.normalize(file);
        if (path.sep === "\\") {
            normalizedFile = normalizedFile.replace(/\\/g, "\\\\");
        }
        logger.silly(`Found file: ${normalizedFile}`);
        fs.appendFileSync(outputPath, `"${normalizedFile}",`);
        fileCount++;
    }
    if (fileCount > 0) {
        // Remove trailing comma
        fs.truncateSync(outputPath, fs.statSync(outputPath).size - 1);
    }
    fs.appendFileSync(outputPath, "]}");

    logger.info(
        `Discovered ${fileCount} files in ${ssocPath} and wrote the paths to ${outputPath}`,
    );

    // Verify the output file
    JSON.parse(fs.readFileSync(outputPath, "utf8"));
    logger.verbose(`Verified the output file: ${outputPath}`);

    logEnd("discover");
}
