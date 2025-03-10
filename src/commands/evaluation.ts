import commandLineArgs, { OptionDefinition } from "command-line-args";
import { logEnd, logger, logStart } from "../logger";
import path from "path";
import { assertDirectory } from "../utils";
import fs from "fs";
import { UltimateSlicerStats } from "@eagleoutice/flowr/benchmark/summarizer/data";
import { createUltimateEvalStats, printResults, RepoInfo, objectToLaTeX } from "../model";
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
        reviver,
    ) as UltimateSlicerStats;
    const insensResult = JSON.parse(
        fs.readFileSync(insensPath, "utf8"),
        reviver,
    ) as UltimateSlicerStats;

    if (sensResult.totalRequests !== insensResult.totalRequests) {
        logger.warn("Total requests do not match");
    }
    if (sensResult.totalSlices !== insensResult.totalSlices) {
        logger.warn("Total slices do not match");
    }

    const evalStats = createUltimateEvalStats(insensResult, sensResult);
    fs.writeFileSync(
        path.join(resultsPath, "eval-stats.json"),
        JSON.stringify(evalStats, replacer),
    );

    printResults(evalStats);

    const repoInfo = JSON.parse(
        fs.readFileSync(path.join(resultsPath, "repo-info.json"), "utf8"),
    ) as { flowr: RepoInfo; ssoc: RepoInfo };

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

    let latex = objectToLaTeX(evalStats);
    latex += "\n" + objectToLaTeX(repoInfo);
    latex += "\n" + objectToLaTeX(errors);
    fs.writeFileSync(path.join(resultsPath, "eval-stats.tex"), latex);

    logEnd("eval");
}

function replacer<T>(key: string, value: T) {
    if (value instanceof Map) {
        return Array.from(value.entries());
    }
    return value;
}

function reviver<T>(key: string, value: T) {
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
    "time limit reached": T;
    "out of memory": T;
    "non r side": {
        "no slices found": T;
        "parse error": T;
        "maximum call stack size exceeded": T;
        "type error": T;
        "range error": T;
        "guard error": T;
        "unknown error": T;
    };
    "unknown error": T;
    total: T;
}

async function summarizeErrors(path: string): Promise<ErrorSummary<number>> {
    const errors: ErrorSummary<number> = {
        "time limit reached": 0,
        "out of memory": 0,
        "non r side": {
            "no slices found": 0,
            "parse error": 0,
            "maximum call stack size exceeded": 0,
            "type error": 0,
            "range error": 0,
            "guard error": 0,
            "unknown error": 0,
        },
        "unknown error": 0,
        total: 0,
    };

    const rl = readline.createInterface({
        input: fs.createReadStream(path),
        terminal: false,
    });

    let actualTotal = 0;
    for await (const line of rl) {
        if (line.includes("Non R-Side error")) {
            if (line.includes("No possible slices found")) {
                errors["non r side"]["no slices found"]++;
            } else if (line.includes("ParseError")) {
                errors["non r side"]["parse error"]++;
            } else if (line.includes("Maximum call stack size exceeded")) {
                errors["non r side"]["maximum call stack size exceeded"]++;
            } else if (line.includes("TypeError")) {
                errors["non r side"]["type error"]++;
            } else if (line.includes("RangeError")) {
                errors["non r side"]["range error"]++;
            } else if (line.includes("GuardError")) {
                errors["non r side"]["guard error"]++;
            } else {
                errors["non r side"]["unknown error"]++;
            }
        } else if (
            line.includes("FATAL ERROR:") &&
            line.includes("JavaScript heap out of memory")
        ) {
            errors["out of memory"]++;
        } else if (line.includes("Killing child process with")) {
            errors["time limit reached"]++;
        } else if (line.includes("files due to errors")) {
            const match = line.match(/(\d+) files due to errors/);
            if (match) {
                actualTotal += parseInt(match[1]);
            }
        }
    }

    let total = 0;
    for (const key in errors) {
        if (key === "non r side") {
            for (const subKey in errors[key]) {
                total += errors[key][subKey];
            }
        } else {
            total += errors[key];
        }
    }
    errors["total"] = total;
    errors["unknown error"] = actualTotal - total;

    return errors;
}
