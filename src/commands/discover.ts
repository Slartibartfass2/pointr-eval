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
    const files: FileInfo[] = [];
    for await (const file of globIterate(`${ssocPath}/sources/**/*.[r|R]`, { absolute: true })) {
        const normalizedFile = path.normalize(file);
        // logger.silly(`Found file: ${normalizedFile}`);
        files.push({ path: normalizedFile, size: fs.statSync(file).size });
    }
    const data: DiscoverData = {
        repo: repoInfo,
        files: equallyDistribute(files).map((f) => f.path),
    };
    fs.writeFileSync(outputPath, JSON.stringify(data));

    logger.info(
        `Discovered ${files.length} files in ${ssocPath} and wrote the paths to ${outputPath}`,
    );

    logEnd("discover");
}

interface FileInfo {
    path: string;
    size: number;
}

/**
 * Equally distribute the files.
 *
 * Given a list of files, this function sorts the files by size in descending order and distributes them equally across 100 buckets.
 * The files are then distributed in a zig-zag pattern across the buckets.
 *
 * @param files - The list of files to distribute
 * @returns The equally distributed files (flattened buckets)
 */
function equallyDistribute(files: FileInfo[]): FileInfo[] {
    // Sort the files by size in descending order
    const sortedFiles = files.toSorted((a, b) => b.size - a.size);

    // Create buckets for the files
    const numberOfBuckets = 100;
    const buckets: FileInfo[][] = [];
    for (let i = 0; i < numberOfBuckets; i++) {
        buckets.push([]);
    }

    // Distribute the files in a zig-zag pattern
    for (let i = 0; i < sortedFiles.length; i++) {
        const element = sortedFiles[i];
        const dir = (i / (numberOfBuckets + 1)) % 2;
        const bucketIndex =
            dir === 0 ? i % numberOfBuckets : numberOfBuckets - 1 - (i % numberOfBuckets);

        buckets[bucketIndex].push(element);
    }

    return buckets.flatMap((bucket) => bucket);
}
