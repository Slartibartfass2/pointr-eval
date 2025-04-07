import { execAsync } from "./processes";

/**
 * Repository information for Flowr, SSOC, and PointrEval.
 */
export interface RepoInfos {
    flowr: RepoInfo;
    ssoc: RepoInfo;
    pointrEval: RepoInfo;
}

/**
 * Repository information.
 *
 * This interface contains information about the repository, including the last tag, commit hash, and branch name.
 */
export interface RepoInfo {
    tag: string | undefined;
    commit: string | undefined;
    branch: string | undefined;
}

/**
 * Get repository information from a given path.
 *
 * @param path - The path to the repository.
 * @returns A promise that resolves to an object containing repository information.
 */
export async function getRepoInfo(path: string): Promise<RepoInfo> {
    return {
        tag: await getLastRepoTag(path),
        commit: await getRepoCommit(path),
        branch: await getRepoBranch(path),
    };
}

/**
 * Get the last tag from the repository.
 *
 * @param path - The path to the repository.
 * @returns A promise that resolves to the last tag.
 */
async function getLastRepoTag(path: string): Promise<string | undefined> {
    return await getCommandResult("git describe --tags --abbrev=0", path);
}

/**
 * Get the current commit hash from the repository.
 *
 * @param path - The path to the repository.
 * @returns A promise that resolves to the current commit hash.
 */
async function getRepoCommit(path: string): Promise<string | undefined> {
    return await getCommandResult("git rev-parse HEAD", path);
}

/**
 * Get the current branch name from the repository.
 *
 * @param path - The path to the repository.
 * @returns A promise that resolves to the current branch name.
 */
async function getRepoBranch(path: string): Promise<string | undefined> {
    return await getCommandResult("git rev-parse --abbrev-ref HEAD", path);
}

/**
 * Execute a command and return the result.
 *
 * @param command - The command to execute.
 * @param cwd - The working directory.
 * @returns A promise that resolves to the result of the command.
 */
async function getCommandResult(command: string, cwd: string): Promise<string> {
    let result: string;
    await execAsync(command, cwd, undefined, true).then((output) => (result = output));
    return result.trim();
}
