import commandLineArgs from "command-line-args";
import { logger } from "../logger";
import { globIterate } from "glob";
import fs from "fs";
import path from "path";
import { DiscoverData, DiscoverStats, FileInfo, FileSize, Size } from "../model/discover-data";
import { isBinaryFileSync } from "isbinaryfile";
import { PathManager } from "../path-manager";
import { TimeManager } from "../time-manager";
import { assertDirectory, writeJsonFile } from "../utils/fs-helper";
import { getRepoInfo, RepoInfos } from "../utils/repo-info";
import { discoverOptions, SOURCE_PATH_FLAG } from "../options";

/**
 * Run the discover command.
 *
 * Expects a 'sources' directory at the provided path.
 * Discovers all files in the directory and its subdirectories.
 * Writes the paths of the discovered files to the output file.
 */
export async function runDiscover(
    argv: string[],
    pathManager: PathManager,
    timeManager: TimeManager,
) {
    const options = commandLineArgs(discoverOptions, { argv, stopAtFirstUnknown: true });
    logger.debug(`Parsed options: ${JSON.stringify(options)}`);

    timeManager.start("discover");

    const sourcePath = options[SOURCE_PATH_FLAG];
    const doesSourcePathExist = assertDirectory(
        sourcePath,
        `The path to the source repo is required. Use the --${SOURCE_PATH_FLAG} option.`,
    );
    if (!doesSourcePathExist) {
        return;
    }

    // Write the repo info to the output directory
    const repoInfos: Pick<RepoInfos, "source"> = { source: await getRepoInfo(sourcePath) };
    logger.verbose(`source repo info: ${JSON.stringify(repoInfos.source)}`);
    writeJsonFile<RepoInfos>(pathManager.getPath("repo-info"), repoInfos as RepoInfos);

    // Discover all files in the source repo
    const data = await discoverFiles(sourcePath);
    data.files = equallyDistribute(data.files, compareFiles);

    const stats = createDiscoverStats(data);
    writeJsonFile(pathManager.getPath("discover-stats"), stats);
    const outputPath = pathManager.getPath("discover-output");
    writeJsonFile(outputPath, data);

    const csvPath = outputPath.replace(".json", ".csv");
    fs.writeFileSync(
        csvPath,
        "path,sourcedBytes,singleBytes,sourcedLines,singleLines,sourcedNonEmptyLines,singleNonEmptyLines,sourcedCodeLines,singleCodeLines\n" +
            data.files
                .toSorted(compareFiles)
                .map(({ path, size }) => {
                    const sourced = size.sourced;
                    const single = size.single;
                    return `"${path}",${sourced.bytes},${single.bytes},${sourced.lines},${single.lines},${sourced.nonEmptyLines},${single.nonEmptyLines},${sourced.codeLines},${single.codeLines}`;
                })
                .join("\n"),
    );

    logger.info(
        `Discovered ${data.files.length} files in ${sourcePath} and wrote the paths to ${outputPath}`,
    );

    timeManager.stop("discover");
}

/**
 * Discover all files in the given path.
 *
 * This function iterates over all files in the 'sources' directory and its subdirectories.
 * It excludes binary files, empty files, and files that contain no code.
 * It also counts the number of files that source other files.
 *
 * @param rFilesPath - The path to the R files directory
 * @returns The discovered files
 */
async function discoverFiles(rFilesPath: string): Promise<DiscoverData> {
    const discoverData: DiscoverData = {
        files: [],
        binaryFiles: [],
        emptyFiles: [],
        nonCodeFiles: [],
        numberOfSourcingFiles: 0,
    };

    for await (const file of globIterate(`${rFilesPath}/**/*.[r|R]`, { absolute: true })) {
        // Exclude files that are binary
        if (isBinaryFileSync(file)) {
            discoverData.binaryFiles.push(file);
            continue;
        }

        // Exclude files that are empty
        const size = getSizeOfFile(file);
        if (size.sourced.bytes === 0 || size.sourced.nonEmptyLines === 0) {
            logger.silly(`File ${file} has size 0B or has only empty lines.`);
            discoverData.emptyFiles.push(file);
            continue;
        }

        // Exclude files that contain no code
        if (size.sourced.codeLines === 0) {
            logger.silly(`File ${file} has 0 code lines.`);
            discoverData.nonCodeFiles.push(file);
            continue;
        }

        // Count the number of files that source other files
        if (size.sourced.bytes > size.single.bytes) {
            discoverData.numberOfSourcingFiles++;
        }

        // Add non-binary files with a size greater than 0, containing code
        discoverData.files.push({ path: file, size });
    }

    return discoverData;
}

/**
 * Create statistics for the discovered data.
 *
 * @param data - The discovered data
 * @returns The statistics of the discovered data
 */
function createDiscoverStats(data: DiscoverData): DiscoverStats {
    const totalFileCount =
        data.files.length +
        data.binaryFiles.length +
        data.emptyFiles.length +
        data.nonCodeFiles.length;

    return {
        totalFileCount: totalFileCount,
        fileCount: data.files.length,
        binaryFileCount: data.binaryFiles.length,
        emptyFileCount: data.emptyFiles.length,
        nonCodeFileCount: data.nonCodeFiles.length,
        sourcingFileCount: data.numberOfSourcingFiles,
    };
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

/**
 * Equally distribute the items according to their values.
 *
 * @param items - The items to distribute
 * @param compare - The function to compare the items
 * @returns The equally distributed items
 */
function equallyDistribute<T>(items: T[], compare: (a: T, b: T) => number): T[] {
    // Sort the items by size in descending order
    const sortedFiles = items.toSorted(compare);

    let result = [sortedFiles.shift(), sortedFiles.shift()];
    if (sortedFiles.length === 0) {
        return result;
    }

    while (sortedFiles.length > 0) {
        const a = [];
        const insertPart = [];
        const length1 = Math.min(result.length - 1, sortedFiles.length);
        for (let i = 0; i < length1; i++) {
            insertPart.push(sortedFiles.shift());
        }
        const length = result.length * 2 - 1;
        let skip = result.length - 1 - insertPart.length;
        for (let i = 0; i < length; i++) {
            let insert: T;
            if (i % 2 === 0) {
                insert = result.shift();
            } else {
                if (skip > 0) {
                    skip--;
                    continue;
                }
                insert = insertPart.pop();
            }
            if (insert) {
                a.push(insert);
            }
        }
        result = a;
    }
    return result;
}
