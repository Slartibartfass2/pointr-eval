import readline from "readline";
import fs from "fs";
import { logger } from "../logger";

export interface ErrorSummary<T = number> {
    timeLimitReached: T;
    outOfMemory: T;
    nonRSide: {
        guardError: {
            noSlicesFound: T;
            nodesToBeJoinedRequireSameExitPoints: T;
            assignmentHasNoSource: T;
            unknownError: T;
            total: T;
        };
        parseError: {
            unexpectedNodeType: T;
            unknownError: T;
            total: T;
        };
        typeError: {
            cannotReadPropertiesOfUndefined: T;
            unknownError: T;
            total: T;
        };
        rangeError: {
            maximumCallStackSizeExceeded: T;
            invalidStringLength: T;
            invalidArrayLength: T;
            unknownError: T;
            total: T;
        };
        unknownError: T;
        total: T;
    };
    unknownError: T;
    total: T;
}

/**
 * Summarizes the errors in the given log file.
 *
 * @param path - The path to the log file.
 * @returns A promise that resolves to an object containing the error summary.
 */
export async function summarizeErrors(path: string): Promise<ErrorSummary> {
    const errors: ErrorSummary = {
        timeLimitReached: 0,
        outOfMemory: 0,
        nonRSide: {
            guardError: {
                noSlicesFound: 0,
                nodesToBeJoinedRequireSameExitPoints: 0,
                assignmentHasNoSource: 0,
                unknownError: 0,
                total: 0,
            },
            parseError: {
                unexpectedNodeType: 0,
                unknownError: 0,
                total: 0,
            },
            typeError: {
                cannotReadPropertiesOfUndefined: 0,
                unknownError: 0,
                total: 0,
            },
            rangeError: {
                maximumCallStackSizeExceeded: 0,
                invalidStringLength: 0,
                invalidArrayLength: 0,
                unknownError: 0,
                total: 0,
            },
            unknownError: 0,
            total: 0,
        },
        unknownError: 0,
        total: 0,
    };

    const rl = readline.createInterface({
        input: fs.createReadStream(path, "utf-8"),
        terminal: false,
    });

    let actualTotal = 0;
    for await (const line of rl) {
        if (line.includes("Non R-Side error")) {
            if (line.includes("GuardError")) {
                if (line.includes("No possible slices found")) {
                    errors.nonRSide.guardError.noSlicesFound++;
                } else if (line.includes("nodes to be joined must have same exist points")) {
                    errors.nonRSide.guardError.nodesToBeJoinedRequireSameExitPoints++;
                } else if (line.includes("has no source, impossible!")) {
                    errors.nonRSide.guardError.assignmentHasNoSource++;
                } else {
                    errors.nonRSide.guardError.unknownError++;
                }
                errors.nonRSide.guardError.total++;
            } else if (line.includes("ParseError")) {
                if (line.includes("unexpected node type")) {
                    errors.nonRSide.parseError.unexpectedNodeType++;
                } else {
                    errors.nonRSide.parseError.unknownError++;
                }
                errors.nonRSide.parseError.total++;
            } else if (line.includes("TypeError")) {
                if (line.includes("Cannot read properties of undefined")) {
                    errors.nonRSide.typeError.cannotReadPropertiesOfUndefined++;
                } else {
                    errors.nonRSide.typeError.unknownError++;
                }
                errors.nonRSide.typeError.total++;
            } else if (line.includes("RangeError")) {
                if (line.includes("Maximum call stack size exceeded")) {
                    errors.nonRSide.rangeError.maximumCallStackSizeExceeded++;
                } else if (line.includes("Invalid string length")) {
                    errors.nonRSide.rangeError.invalidStringLength++;
                } else if (line.includes("Invalid array length")) {
                    errors.nonRSide.rangeError.invalidArrayLength++;
                } else {
                    errors.nonRSide.rangeError.unknownError++;
                }
                errors.nonRSide.rangeError.total++;
            } else {
                errors.nonRSide.unknownError++;
            }
            errors.nonRSide.total++;
        } else if (
            line.includes("FATAL ERROR:") &&
            line.includes("JavaScript heap out of memory")
        ) {
            errors.outOfMemory++;
        } else if (line.includes("Killing child process with")) {
            errors.timeLimitReached++;
        } else if (line.includes("files due to errors")) {
            const match = line.match(/(\d+) files due to errors/);
            if (match) {
                actualTotal += parseInt(match[1]);
            }
        }
    }

    const total = sumErrorSums(errors);
    errors.total = total;
    errors.unknownError = actualTotal - total;

    return errors;
}

function sumErrorSums(obj: unknown): number {
    let sum = 0;
    for (const [key, value] of Object.entries(obj)) {
        if (key === "unknownError" || key === "total") {
            continue;
        }

        if (typeof value === "object") {
            const subSum = sumErrorSums(value);
            sum += subSum;
            if ("total" in value && value["total"] !== subSum) {
                logger.warn(`Sum of ${key} does not match total: ${subSum} !== ${value["total"]}`);
            }
        } else if (typeof value === "number") {
            sum += value;
        }
    }
    return sum;
}
