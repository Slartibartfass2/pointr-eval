import commandLineArgs, { OptionDefinition } from "command-line-args";
import { logEnd, logger, logStart } from "../logger";
import path from "path";
import { assertDirectory } from "../utils";
import fs from "fs";
import { UltimateSlicerStats } from "@eagleoutice/flowr/benchmark/summarizer/data";
import {
    createUltimateEvalStats,
    printResults,
    RepoInfo,
    repoInfoToLatex,
    statsToLaTeX,
} from "../model";

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

    let latex = statsToLaTeX(evalStats);
    latex += "\n" + repoInfoToLatex(repoInfo.flowr, "flowr");
    latex += "\n" + repoInfoToLatex(repoInfo.ssoc, "ssoc-data");
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
