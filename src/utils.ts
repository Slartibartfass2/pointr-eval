import fs from "fs";
import { exec, fork } from "child_process";
import { logger } from "./logger";
import path from "path";
import { capitalize, flattenObject, RepoInfo, RunTime, Times } from "./model";
import formatDuration from "format-duration";

/**
 * Execute a command asynchronously.
 *
 * @param command - The command to execute.
 * @param cwd - The working directory.
 * @param logPath - The path to the log file. If not provided, the output will be returned as a string.
 * @returns A promise that resolves when the command has finished.
 */
export async function execAsync(
    command: string,
    cwd: string,
    logPath: string | undefined = undefined,
    returnOutput: boolean = false,
): Promise<string> {
    logger.verbose(`Running command: '${command}' in ${cwd}`);
    const childProcess = exec(command, { cwd });
    let result: string = undefined;
    return new Promise<string>((resolve, reject) => {
        childProcess.on("exit", (code, signal) => {
            if (code === 0) {
                resolve(result);
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
            if (logPath) {
                fs.appendFileSync(logPath, data);
            }
            if (returnOutput) {
                if (result === undefined) {
                    result = data;
                } else {
                    result += data;
                }
            }
        });
        childProcess.stderr?.on("data", (data) => {
            if (logPath) {
                fs.appendFileSync(logPath, data);
            }
        });
    });
}

export function forkAsync(modulePath: string, args: string[], logPath: string): Promise<void> {
    logger.verbose(`Running module: '${modulePath}' in with args ${args}`);
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

async function getCommandResult(command: string, cwd: string): Promise<string | undefined> {
    let result: string | undefined;
    await execAsync(command, cwd, undefined, true)
        .then((v) => (result = v))
        .catch(() => (result = undefined));
    return result?.trim();
}

async function getLastRepoTag(path: string): Promise<string | undefined> {
    return await getCommandResult("git describe --tags --abbrev=0", path);
}

async function getRepoCommit(path: string): Promise<string | undefined> {
    return await getCommandResult("git rev-parse HEAD", path);
}

async function getRepoBranch(path: string): Promise<string | undefined> {
    return await getCommandResult("git rev-parse --abbrev-ref HEAD", path);
}

export async function getRepoInfo(path: string): Promise<RepoInfo> {
    return {
        tag: await getLastRepoTag(path),
        commit: await getRepoCommit(path),
        branch: await getRepoBranch(path),
    };
}

export function writeTime(time: Partial<Times>, outputPath: string): void {
    let times = {} as Times;
    const timesPath = path.join(outputPath, "times.json");
    if (fs.existsSync(timesPath)) {
        times = JSON.parse(fs.readFileSync(timesPath, "utf8"));
    }

    // Only copy defined values from the partial object
    Object.keys(time).forEach((key) => {
        if (time[key] !== undefined) {
            times[key] = time[key];
        }
    });

    fs.writeFileSync(timesPath, JSON.stringify(times));
}

export function createRunTime(start: number, end: number): RunTime {
    const durationInMs = end - start;
    return {
        start: new Date(start),
        end: new Date(end),
        durationInMs,
        durationDisplay: formatDuration(durationInMs),
    };
}

export function printTimes(times: Times): void {
    const a = flattenObject(times)
        .filter(([keys]) => keys.some((key) => key === "durationDisplay"))
        .map(
            ([key, value]) =>
                [key.slice(0, -1).map(capitalize).join(""), value] as [string, unknown],
        );
    console.table(a);
}
