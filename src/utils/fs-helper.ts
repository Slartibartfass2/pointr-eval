import fs from "fs";
import path from "path";
import { logger } from "../logger";

/**
 * Checks whether a given directory is empty.
 *
 * @param directory - The directory to check.
 * @returns True if the directory is empty, false otherwise.
 */
export function isDirectoryEmpty(directory: string): boolean {
    try {
        const files = fs.readdirSync(directory);
        return files.length === 0;
    } catch {
        return false;
    }
}

/**
 * Ensures that a directory exists. If it does not exist, it creates the directory.
 *
 * @param directoryPath - The path to the directory to check.
 */
export function ensureDirectoryExists(directoryPath: string): void {
    fs.mkdirSync(directoryPath, { recursive: true });
}

/**
 * Ensures that a file's directory exists. If it does not exist, it creates the directory.
 *
 * @param filePath - The path to the file to check.
 */
export function ensureFileDirectoryExists(filePath: string): void {
    const directory = path.parse(filePath).dir;
    // ensure the directory exists if path contains one
    if (directory !== "") {
        fs.mkdirSync(directory, { recursive: true });
    }
}

/**
 * Ensures that a file exists. If it does not exist, it creates an empty file.
 *
 * @param filePath - The path to the file to check.
 */
export function ensureFileExists(filePath: string): void {
    fs.writeFileSync(filePath, "");
}

/**
 * Reads a JSON file and parses it into an object.
 *
 * @param filePath - The path to the JSON file.
 * @param reviver - An optional reviver function for parsing the JSON.
 * @returns The parsed object.
 */
export function readJsonFile<T>(
    filePath: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reviver?: (this: any, key: string, value: any) => any,
): T {
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data, reviver) as T;
}

/**
 * Writes an object to a JSON file.
 *
 * @param filePath - The path to the JSON file.
 * @param data - The object to write.
 * @param replacer - An optional replacer function for stringifying the JSON.
 */
export function writeJsonFile<T>(
    filePath: string,
    data: T,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    replacer?: (this: any, key: string, value: any) => any,
): void {
    const jsonData = JSON.stringify(data, replacer);
    fs.writeFileSync(filePath, jsonData);
}

/**
 * Checks if a given path is a valid directory. If not, it logs an error message.
 *
 * @param directoryPath - The path to check.
 * @param message - The error message to log if the path is not valid.
 * @returns True if the path is a valid directory, false otherwise.
 */
export function assertDirectory(directoryPath: string | undefined, message: string): boolean {
    if (!directoryPath) {
        logger.error(message);
        return false;
    }

    const stat = fs.statSync(directoryPath);
    if (!stat.isDirectory()) {
        logger.error(`The path provided is not a directory: ${directoryPath}`);
        return false;
    }

    return true;
}

/**
 * Iterates through all files in a directory and applies a callback function to each file.
 *
 * @param dir - The directory to iterate through.
 * @param onFile - The callback function to apply to each file.
 */
export function iterateFilesInDir(
    dir: string,
    onFile: (dirPath: string, fileName: string) => void,
) {
    const dirEntries = fs.readdirSync(dir, { recursive: true, withFileTypes: true });
    for (const dir of dirEntries) {
        const fileName = dir.name;
        const dirPath = dir.parentPath;

        if (dir.isFile()) {
            onFile(dirPath, fileName);
        }
    }
}

/**
 * Iterates through all files in multiple directories and applies a callback function to either each file in all directories or each file not in all directories.
 *
 * @param paths - The directories to iterate through.
 * @param fileFilter - A filter function to determine which files to include.
 * @param onFile - The callback function to apply to each file.
 * @param mode - The mode of operation (onFilesInAllPaths or onFilesInSinglePath).
 * @returns An object containing the counts of files found in all paths and not in all paths.
 */
export function onFilesInPaths(
    paths: string[],
    fileFilter: (fileName: string) => boolean,
    onFile: (dir: string, paths: (string | undefined)[]) => void,
    mode: "onFilesInAllPaths" | "onFilesInSinglePath",
): { inAll: number; notInAll: number } {
    const files = new Map<string, (string | undefined)[]>();

    for (let i = 0; i < paths.length; i++) {
        iterateFilesInDir(paths[i], (dirPath, fileName) => {
            if (fileFilter(fileName)) {
                const dir = path.join(dirPath.replace(paths[i], ""), fileName);
                if (!files.has(dir)) {
                    files.set(dir, []);
                }
                files.get(dir)![i] = path.join(dirPath, fileName);
            }
        });
    }

    let notInAllCount = 0;
    let inAllCount = 0;
    for (const [dir, foundPaths] of files.entries()) {
        const isNotInAll = foundPaths.length !== paths.length;
        if (isNotInAll) {
            notInAllCount++;
            if (mode === "onFilesInAllPaths") {
                continue;
            }
        } else if (mode === "onFilesInSinglePath") {
            continue;
        } else {
            inAllCount++;
        }

        const dirPath = path.dirname(dir);
        onFile(dirPath, foundPaths);
    }

    return { inAll: inAllCount, notInAll: notInAllCount };
}
