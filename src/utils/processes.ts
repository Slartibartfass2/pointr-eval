import { exec, fork } from "child_process";
import { logger } from "../logger";
import fs from "fs";

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

/**
 * Fork a child process asynchronously.
 *
 * @param modulePath - The path to the module to fork.
 * @param args - The arguments to pass to the module.
 * @param logPath - The path to the log file.
 * @returns A promise that resolves when the module has finished.
 */
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

export async function buildFlowr(flowrPath: string, logPath: string): Promise<void> {
    await execAsync("npm run build-dev", flowrPath, logPath);
}
