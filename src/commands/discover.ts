import commandLineArgs, { OptionDefinition } from "command-line-args";
import { logEnd, logger, logStart } from "../logger";
import { globIterate } from "glob";
import fs from "fs";
import path from "path";
import {
    assertDirectory,
    createRunTime,
    ensureDirectoryExists,
    getRepoInfo,
    writeTime,
} from "../utils";
import { DiscoverData, FileInfo, FileSize, Size } from "../model";
import { isBinaryFileSync } from "isbinaryfile";
import seedrandom from "seedrandom";

/**
 * Run the discover command.
 *
 * Expects a 'sources' directory at the provided path.
 * Discovers all files in the directory and its subdirectories.
 * Writes the paths of the discovered files to the output file.
 */
export async function runDiscover(argv: string[]) {
    const runDefinitions: OptionDefinition[] = [
        { name: "ssoc-path", alias: "i", type: String },
        { name: "output-path", alias: "o", type: String, defaultValue: "files.json" },
        { name: "results-path", alias: "r", type: String },
        { name: "seed", alias: "s", type: String, defaultValue: "U2xhcnRpYmFydGZhc3My" },
    ];
    const options = commandLineArgs(runDefinitions, { argv, stopAtFirstUnknown: true });
    logger.debug(`Parsed options: ${JSON.stringify(options)}`);

    logStart("discover");
    const startTime = Date.now();

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
    const binaryFiles: string[] = [];
    const emptyFiles: string[] = [];
    const nonCodeFiles: string[] = [];
    let numberOfSourcingFiles = 0;
    for await (const file of globIterate(`${ssocPath}/sources/**/*.[r|R]`, { absolute: true })) {
        // Exclude files that are binary
        if (isBinaryFileSync(file)) {
            binaryFiles.push(file);
            continue;
        }

        // Exclude files that are empty
        const size = getSizeOfFile(file);
        if (size.sourced.bytes === 0 || size.sourced.nonEmptyLines === 0) {
            logger.silly(`File ${file} has size 0B or has only empty lines.`);
            emptyFiles.push(file);
            continue;
        }

        // Exclude files that contain no code
        if (size.sourced.codeLines === 0) {
            logger.silly(`File ${file} has 0 code lines.`);
            nonCodeFiles.push(file);
            continue;
        }

        // Count the number of files that source other files
        if (size.sourced.bytes > size.single.bytes) {
            numberOfSourcingFiles++;
        }

        // Add non-binary files with a size greater than 0, containing code
        files.push({ path: file, size });
    }
    const distributedFiles = equallyDistribute(files, options.seed);
    const data: DiscoverData = {
        repo: repoInfo,
        seed: options.seed,
        files: distributedFiles,
        binaryFiles,
        emptyFiles,
        nonCodeFiles,
        numberOfSourcingFiles,
    };
    fs.writeFileSync(outputPath, JSON.stringify(data));
    const csvPath = outputPath.replace(".json", ".csv");
    fs.writeFileSync(
        csvPath,
        "path,sourcedBytes,singleBytes,sourcedLines,singleLines,sourcedNonEmptyLines,singleNonEmptyLines,sourcedCodeLines,singleCodeLines\n" +
            files
                .sort(compareFiles)
                .map(({ path, size }) => {
                    const sourced = size.sourced;
                    const single = size.single;
                    return `"${path}",${sourced.bytes},${single.bytes},${sourced.lines},${single.lines},${sourced.nonEmptyLines},${single.nonEmptyLines},${sourced.codeLines},${single.codeLines}`;
                })
                .join("\n"),
    );

    logger.info(
        `Discovered ${files.length} files in ${ssocPath} and wrote the paths to ${outputPath}`,
    );

    const endTime = Date.now();
    logEnd("discover");

    if (options["results-path"]) {
        writeTime({ discover: createRunTime(startTime, endTime) }, options["results-path"]);
    }
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
function equallyDistribute(files: FileInfo[], seed: string): FileInfo[] {
    // Sort the files by size in descending order
    const sortedFiles = files.toSorted(compareFiles);

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

    const random = seedrandom(seed);
    return buckets.flatMap((bucket) => bucket.toSorted(() => random() - 0.5));
}

/**
 * Get the size of the file and all files that are sourced in the file.
 *
 * This tries to estimate the effort required to analyze the file.
 *
 * @param filePath - The path of the file
 * @param maxRecursion - The maximum recursion depth
 * @returns The size of the file and all sourced files
 */
function getSizeOfFile(filePath: string, maxRecursion = 10): Size | undefined {
    if (maxRecursion <= 0) {
        return undefined;
    }

    if (!fs.existsSync(filePath)) {
        return undefined;
    }

    const singleSize = fs.statSync(filePath).size;
    const lines = fs.readFileSync(filePath, "utf8").split("\n");
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
    const codeLines = nonEmptyLines.filter((line) => !line.trim().startsWith("#"));

    const single: FileSize = {
        bytes: singleSize,
        lines: lines.length,
        nonEmptyLines: nonEmptyLines.length,
        codeLines: codeLines.length,
    };
    const size: Size = {
        single: single,
        sourced: single,
    };

    const sourcePaths = extractSourcePaths(filePath);
    if (sourcePaths.length > 0) {
        logger.silly(`File ${filePath} sources ${sourcePaths.length} files.`);
    }
    for (const sourcePath of sourcePaths) {
        const sourceFile = path.join(path.dirname(filePath), sourcePath);
        const sourcedSize = getSizeOfFile(sourceFile, maxRecursion - 1);
        if (sourcedSize) {
            size.sourced = sumFileSize(size.sourced, sourcedSize.sourced);
        }
    }

    return size;
}

function sumFileSize(a: FileSize, b: FileSize): FileSize {
    return {
        bytes: a.bytes + b.bytes,
        lines: a.lines + b.lines,
        nonEmptyLines: a.nonEmptyLines + b.nonEmptyLines,
        codeLines: a.codeLines + b.codeLines,
    };
}

/**
 * R files may contain source() calls to other R files.
 * This function extracts the paths of the source files from the given R file.
 */
function extractSourcePaths(filePath: string): string[] {
    const fileContent = fs.readFileSync(filePath, "utf8");
    const regex = /(?<!#)\s*source\(["']([^"']+)["'],*/g;
    const matches = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(fileContent)) !== null) {
        matches.push(match[1]);
    }

    return matches;
}

/**
 * Sort the files by size in descending order.
 *
 * If the sizes are equal, the paths are compared to ensure a stable sort.
 */
function compareFiles(a: FileInfo, b: FileInfo) {
    const compare = b.size.sourced.bytes - a.size.sourced.bytes;
    if (compare === 0) {
        return a.path.localeCompare(b.path);
    }
    return compare;
}
