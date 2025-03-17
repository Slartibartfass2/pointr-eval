import commandLineArgs, { OptionDefinition } from "command-line-args";
import { logEnd, logger, logStart } from "../logger";
import path from "path";
import { assertDirectory, createRunTime, writeTime } from "../utils";
import fs from "fs";
import { UltimateSlicerStats } from "@eagleoutice/flowr/benchmark/summarizer/data";
import {
    createUltimateEvalStats,
    printResults,
    objectToLaTeX,
    EvalValues,
    flattenObject,
    RepoInfos,
} from "../model";
import readline from "readline";

/**
 * Run the evaluation command.
 *
 * Expects the summarizer command to be run.
 * Compares the summaries of the field-sensitive and field-insensitive analyses.
 */
export async function runEval(argv: string[]) {
    const runDefinitions: OptionDefinition[] = [
        { name: "results-path", alias: "i", type: String, defaultValue: "./results" },
    ];
    const options = commandLineArgs(runDefinitions, { argv, stopAtFirstUnknown: true });
    logger.debug(`Parsed options: ${JSON.stringify(options)}`);

    logStart("eval");
    const startTime = Date.now();

    const resultsPathRaw = options["results-path"];

    const doesResultsPathExist = assertDirectory(
        resultsPathRaw,
        "The path to the results directory is required. Use the --results-path option.",
    );
    if (!doesResultsPathExist) {
        return;
    }

    const resultsPath = path.resolve(resultsPathRaw);

    const sensPath = path.join(resultsPath, "sens", "summary-ultimate.json");
    const insensPath = path.join(resultsPath, "insens", "summary-ultimate.json");

    logger.info(`Comparing the summaries in ${sensPath} and ${insensPath}`);

    const sensResult = JSON.parse(
        fs.readFileSync(sensPath, "utf8"),
        statsReviver,
    ) as UltimateSlicerStats;
    const insensResult = JSON.parse(
        fs.readFileSync(insensPath, "utf8"),
        statsReviver,
    ) as UltimateSlicerStats;

    const evalStats = createUltimateEvalStats(insensResult, sensResult);
    fs.writeFileSync(
        path.join(resultsPath, "eval-stats.json"),
        JSON.stringify(evalStats, statsReplacer),
    );

    printResults(evalStats);

    const repoInfo = JSON.parse(
        fs.readFileSync(path.join(resultsPath, "repo-info.json"), "utf8"),
    ) as RepoInfos;

    // Analyze log files for errors
    const logSensPath = path.join(resultsPath, "bench-sens.log");
    const logInsensPath = path.join(resultsPath, "bench-insens.log");

    const [errorsSens, errorsInsens] = await Promise.all([
        summarizeErrors(logSensPath),
        summarizeErrors(logInsensPath),
    ]);

    const errors = {
        sensErrors: errorsSens,
        insensErrors: errorsInsens,
    };

    const benchConfig = JSON.parse(
        fs.readFileSync(path.join(resultsPath, "bench-config.json"), "utf8"),
    );

    let latex = objectToLaTeX(evalStats);
    latex += "\n" + objectToLaTeX(repoInfo);
    latex += "\n" + objectToLaTeX(errors);
    latex += "\n" + objectToLaTeX({ benchConfig });
    fs.writeFileSync(path.join(resultsPath, "eval-stats.tex"), latex);

    // Sanity checks
    Object.entries(evalStats.dataflow.overwrittenIndices).forEach(([key, value]) => {
        if (value["diff"] < 0) {
            logger.warn(`[SANITY CHECK] Overwritten indices diff for ${key} is negative`);
        }
        insensitiveValuePositiveCheck("Overwritten indices", key, value);
    });
    Object.entries(evalStats.dataflow.storedVertexIndices).forEach(([key, value]) => {
        insensitiveValuePositiveCheck("Vertex indices", key, value);
    });
    Object.entries(evalStats.dataflow.storedEnvIndices).forEach(([key, value]) => {
        insensitiveValuePositiveCheck("Env indices", key, value);
    });
    anyValueCheck(evalStats);

    const endTime = Date.now();
    logEnd("eval");

    writeTime({ eval: createRunTime(startTime, endTime) }, resultsPath);
}

export function statsReplacer<T>(key: string, value: T) {
    if (value instanceof Map) {
        return Array.from(value.entries());
    }
    return value;
}

export function statsReviver<T>(key: string, value: T) {
    if ((key === "commonMeasurements" || key === "perSliceMeasurements") && Array.isArray(value)) {
        const map = new Map();
        for (const [k, v] of value) {
            map.set(k, v);
        }
        return map;
    }
    return value;
}

interface ErrorSummary<T = number> {
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

async function summarizeErrors(path: string): Promise<ErrorSummary<number>> {
    const errors: ErrorSummary<number> = {
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
        input: fs.createReadStream(path),
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

function insensitiveValuePositiveCheck(name: string, key: string, value: EvalValues) {
    if (value.insensitiveValue > 0) {
        logger.warn(`[SANITY CHECK] ${name} insensitive value for ${key} is positive`);
    }
}

function anyValueCheck(obj: unknown) {
    flattenObject(obj).forEach(([key, value]) => {
        const name = key.join("-");
        if (
            [
                ["overwrittenIndices"],
                ["storedEnvIndices"],
                ["storedVertexIndices"],
                ["numberOfFunctionDefinitions-min"],
                ["numberOfFunctionDefinitions-median"],
                ["numberOfEdges", "diff"],
                ["numberOfCalls", "diff"],
                ["reduction", "diff"],
                ["reduction", "min"],
                ["dataflow", "min-diff"],
                ["TimePerToken-raw-min"],
            ].some((parts) => parts.every((part) => name.includes(part)))
        ) {
            return;
        }

        if (value === 0) {
            logger.warn(`[SANITY CHECK] Value for ${name} is zero`);
        } else if (key.includes("diff") && Number.isNaN(value)) {
            logger.warn(`[SANITY CHECK] Diff for ${name} is NaN`);
        }
    });
}
