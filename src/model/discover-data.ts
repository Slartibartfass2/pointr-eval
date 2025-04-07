export interface DiscoverStats {
    totalFileCount: number;
    fileCount: number;
    binaryFileCount: number;
    emptyFileCount: number;
    nonCodeFileCount: number;
    sourcingFileCount: number;
}

export interface DiscoverData {
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
