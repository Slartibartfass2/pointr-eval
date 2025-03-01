import commandLineArgs, { OptionDefinition } from "command-line-args";
import { logEnd, logger, logStart } from "../logger";
import path from "path";
import { assertDirectory } from "../utils";
import fs from "fs";
import assert from "assert";
import { UltimateSlicerStats } from "@eagleoutice/flowr/benchmark/summarizer/data";
import { createUltimateEvalStats, statsToLaTeX } from "../model";
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

    assert(sensResult.totalRequests === insensResult.totalRequests, "Total requests do not match");
    assert(sensResult.totalSlices === insensResult.totalSlices, "Total slices do not match");
    assert.deepStrictEqual(sensResult.input, insensResult.input, "Input does not match");

    const evalStats = createUltimateEvalStats(insensResult, sensResult);
    fs.writeFileSync(
        path.join(resultsPath, "eval-stats.json"),
        JSON.stringify(evalStats, replacer),
    );

    const sensReduction = sensResult.reductionNoFluff;
    const insensReduction = insensResult.reductionNoFluff;

    const keys = Object.keys(sensReduction);
    const maxKeyLength = keys.reduce((max, key) => Math.max(max, key.length), 0);

    const header = `Reduction: Field`;
    logger.info(
        `${header}${padding(header, maxKeyLength)}|  Insens |   Sens  |  Diff  |  Diff%  |`,
    );
    logger.info(`-----------------------------------------------------------------------`);
    for (const key of Object.keys(sensReduction)) {
        const insensVal = insensReduction[key]["mean"];
        const sensVal = sensReduction[key]["mean"];
        const diff = sensVal - insensVal;
        const diffPercentage = diff / insensVal;

        logger.info(
            `${key}: ${padding(key, maxKeyLength)}${padP(insensVal)}   ${padP(sensVal)}   ${padP(diff)}  ${padP(diffPercentage)}`,
        );
    }

    fs.writeFileSync(path.join(resultsPath, "eval-stats.tex"), statsToLaTeX(evalStats));

    logEnd("eval");
}

function padding(key: string, length: number) {
    return " ".repeat(length - key.length);
}

function padP(value: number) {
    return String(asPercentage(value)).padEnd(7);
}

function asPercentage(num: number): string {
    if (isNaN(num)) {
        return "??%";
    }
    return `${roundTo(num * 100, 3)}%`;
}

function roundTo(num: number, digits = 4): number {
    const factor = Math.pow(10, digits);
    return Math.round(num * factor) / factor;
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
