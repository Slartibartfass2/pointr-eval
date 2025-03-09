import commandLineArgs, { OptionDefinition } from "command-line-args";
import { logEnd, logger, logStart } from "../logger";
import { globIterate } from "glob";
import fs from "fs";
import path from "path";
import { assertDirectory, ensureDirectoryExists, getRepoInfo } from "../utils";
import { DiscoverData } from "../model";

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

    // Discover all files in the SSOC repo
    const files: [string, number][] = [];
    for await (const file of globIterate(`${ssocPath}/sources/**/*.[r|R]`, { absolute: true })) {
        let normalizedFile = path.normalize(file);
        if (path.sep === "\\") {
            normalizedFile = normalizedFile.replace(/\\/g, "\\\\");
        }
        logger.silly(`Found file: ${normalizedFile}`);
        files.push([normalizedFile, fs.statSync(file).size]);
    }
    const data: DiscoverData = {
        repo: repoInfo,
        // Sort by size in descending order
        files: files.toSorted((a, b) => b[1] - a[1]).map((f) => f[0]),
    };
    fs.writeFileSync(outputPath, JSON.stringify(data));

    logger.info(
        `Discovered ${files.length} files in ${ssocPath} and wrote the paths to ${outputPath}`,
    );

    logEnd("discover");
}
