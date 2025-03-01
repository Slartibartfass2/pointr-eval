import fs from "fs";
import { exec, fork } from "child_process";
import { logger } from "./logger";
import path from "path";

/**
 * Execute a command asynchronously.
 *
 * @param command - The command to execute.
 * @param cwd - The working directory.
 * @param logPath - The path to the log file.
 * @returns A promise that resolves when the command has finished.
 */
export async function execAsync(command: string, cwd: string, logPath: string): Promise<void> {
    const childProcess = exec(command, { cwd });
    return new Promise((resolve, reject) => {
        childProcess.on("exit", (code, signal) => {
            if (code === 0) {
                resolve();
            } else {
                reject(
                    new Error(`Command '${command}' failed with code ${code} and signal ${signal}`),
                );
            }
        });
        childProcess.on("error", (error) => {
            reject(error);
        });
        childProcess.stdout?.on("data", (data) => {
            fs.appendFileSync(logPath, data);
        });
        childProcess.stderr?.on("data", (data) => {
            fs.appendFileSync(logPath, data);
        });
    });
}

export function forkAsync(modulePath: string, args: string[], logPath: string): Promise<void> {
    const child = fork(modulePath, args, { silent: true });
    return new Promise((resolve, reject) => {
        child.on("exit", (code, signal) => {
            if (code === 0) {
                resolve();
            } else {
                const message = `Module '${modulePath}' with args ${args} failed with code ${code} and signal ${signal}`;
                reject(new Error(message));
            }
        });
        child.on("error", (error) => {
            reject(error);
        });
        child.stdout?.on("data", (data) => {
            fs.appendFileSync(logPath, data);
        });
        child.stderr?.on("data", (data) => {
            fs.appendFileSync(logPath, data);
        });
    });
}

export function assertFile(filePath: string | undefined, message: string): boolean {
    if (!filePath) {
        logger.error(message);
        return false;
    }

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
        logger.error(`The path provided is not a file: ${filePath}`);
        return false;
    }

    return true;
}

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

export function ensureDirectoryExists(directoryPath: string): void {
    const directory = path.parse(directoryPath).dir;
    // ensure the directory exists if path contains one
    if (directory !== "") {
        fs.mkdirSync(directory, { recursive: true });
    }
}

export function currentISODate(): string {
    return new Date().toISOString();
}

export async function buildFlowr(flowrPath: string, outputPath: string): Promise<void> {
    const logPath = path.join(outputPath, "build.log");
    fs.writeFileSync(logPath, "");
    logger.info(`Building the flowr repo - ${currentISODate()}`);
    await execAsync("npm run build-dev", flowrPath, logPath);
    logger.info(`Finished building the flowr repo - ${currentISODate()}`);
}
