export interface RepoInfo {
    tag: string | undefined;
    commit: string | undefined;
    branch: string | undefined;
}

export interface RepoInfos {
    flowr: RepoInfo;
    ssoc: RepoInfo;
    ssocFileCount: number;
    ssocBinaryFileCount: number;
    ssocEmptyFileCount: number;
    ssocNonCodeFileCount: number;
    ssocNumberOfSourcingFiles: number;
    discoverSeed: string;
    pointrEval: RepoInfo;
}

export interface DiscoverData {
    repo: RepoInfo;
    seed: string;
    files: FileInfo[];
    binaryFiles: string[];
    emptyFiles: string[];
    nonCodeFiles: string[];
    numberOfSourcingFiles: number;
}

/**
 * non empty lines are lines that contain at least one character
 * code lines are lines that don't have '#' as the first character (ignoring leading whitespace)
 */
export interface FileSize {
    bytes: number;
    lines: number;
    nonEmptyLines: number;
    codeLines: number;
}

export interface Size {
    sourced: FileSize;
    single: FileSize;
}

export interface FileInfo {
    path: string;
    size: Size;
}

export interface BenchConfig {
    /** How many slices per file are sampled */
    sliceSampling: number;
    /** Time limit per file in minutes */
    timeLimitInMinutes: number;
    /** Number of runs */
    runs: number;
    /** Threshold */
    threshold: number;
    /** Sampling Strategy */
    samplingStrategy: "random" | "equidistant";
}

export interface RunTime {
    start: Date;
    end: Date;
    durationInMs: number;
    durationDisplay: string;
}

export interface Times {
    full: RunTime;
    build: RunTime;
    discover: RunTime;
    benchmark: RunTime & {
        insens: RunTime;
        sens: RunTime;
    };
    summarizer: RunTime & {
        insens: RunTime;
        sens: RunTime;
        perFile: RunTime;
    };
    eval: RunTime;
}

export interface SystemInfo {
    cpu: string;
    cores: number;
    memory: string;
    os: string;
    node: string;
    npm: string;
}
