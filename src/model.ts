import {
    CommonSlicerMeasurements,
    PerSliceMeasurements,
    SlicerStatsInput,
} from "@eagleoutice/flowr/benchmark/stats/stats";
import {
    Reduction,
    TimePerToken,
    UltimateSlicerStats,
} from "@eagleoutice/flowr/benchmark/summarizer/data";
import { SummarizedMeasurement } from "@eagleoutice/flowr/util/summarizer";
import { asPercentage } from "./format";
import { SlicerStatsDataflow } from "./flowr-logic";

export type EvalValues = {
    insensitiveValue: number;
    sensitiveValue: number;
    diff: number;
    diffRelative: number;
    factor: number;
};

function isEvalValues(value: unknown): value is EvalValues {
    return (
        typeof value === "object" &&
        value !== null &&
        "insensitiveValue" in value &&
        "sensitiveValue" in value // &&
        // "diff" in value &&
        // "diffRelative" in value
    );
}

type EvalWrapper<T> = {
    [P in keyof T]: EvalValues;
};

type EvalMap<K, V> = Map<K, EvalWrapper<V>>;
type EvalSummarizedMeasurement = EvalWrapper<SummarizedMeasurement>;
type EvalReduction = Reduction<EvalSummarizedMeasurement>;
type EvalSlicerStatsDataflow = SlicerStatsDataflow<EvalSummarizedMeasurement>;
type EvalTimePerToken = TimePerToken<EvalSummarizedMeasurement>;

export interface EvalUltimateSlicerStats {
    totalRequests: Pick<EvalValues, "insensitiveValue" | "sensitiveValue">;
    totalSlices: Pick<EvalValues, "insensitiveValue" | "sensitiveValue">;
    commonMeasurements: EvalMap<CommonSlicerMeasurements, EvalSummarizedMeasurement>;
    perSliceMeasurements: EvalMap<PerSliceMeasurements, EvalSummarizedMeasurement>;
    retrieveTimePerToken: EvalTimePerToken;
    normalizeTimePerToken: EvalTimePerToken;
    dataflowTimePerToken: EvalTimePerToken;
    totalCommonTimePerToken: EvalTimePerToken;
    sliceTimePerToken: EvalTimePerToken;
    reconstructTimePerToken: EvalTimePerToken;
    totalPerSliceTimePerToken: EvalTimePerToken;
    failedToRepParse: EvalValues;
    timesHitThreshold: EvalValues;
    reduction: EvalReduction;
    reductionNoFluff: EvalReduction;
    input: SlicerStatsInput<SummarizedMeasurement>;
    dataflow: EvalSlicerStatsDataflow;
}

export function createUltimateEvalStats(
    insensResult: UltimateSlicerStats,
    sensResult: UltimateSlicerStats,
): EvalUltimateSlicerStats {
    return {
        totalRequests: {
            insensitiveValue: insensResult.totalRequests,
            sensitiveValue: sensResult.totalRequests,
        },
        totalSlices: {
            insensitiveValue: insensResult.totalSlices,
            sensitiveValue: sensResult.totalSlices,
        },
        commonMeasurements: createEvalMap(
            insensResult.commonMeasurements,
            sensResult.commonMeasurements,
        ),
        perSliceMeasurements: createEvalMap(
            insensResult.perSliceMeasurements,
            sensResult.perSliceMeasurements,
        ),
        retrieveTimePerToken: getEvalTimePerToken(
            insensResult.retrieveTimePerToken,
            sensResult.retrieveTimePerToken,
        ),
        normalizeTimePerToken: getEvalTimePerToken(
            insensResult.normalizeTimePerToken,
            sensResult.normalizeTimePerToken,
        ),
        dataflowTimePerToken: getEvalTimePerToken(
            insensResult.dataflowTimePerToken,
            sensResult.dataflowTimePerToken,
        ),
        totalCommonTimePerToken: getEvalTimePerToken(
            insensResult.totalCommonTimePerToken,
            sensResult.totalCommonTimePerToken,
        ),
        sliceTimePerToken: getEvalTimePerToken(
            insensResult.sliceTimePerToken,
            sensResult.sliceTimePerToken,
        ),
        reconstructTimePerToken: getEvalTimePerToken(
            insensResult.reconstructTimePerToken,
            sensResult.reconstructTimePerToken,
        ),
        totalPerSliceTimePerToken: getEvalTimePerToken(
            insensResult.totalPerSliceTimePerToken,
            sensResult.totalPerSliceTimePerToken,
        ),
        failedToRepParse: getEvalValues(insensResult.failedToRepParse, sensResult.failedToRepParse),
        timesHitThreshold: getEvalValues(
            insensResult.timesHitThreshold,
            sensResult.timesHitThreshold,
        ),
        reduction: createEvalReduction(insensResult.reduction, sensResult.reduction),
        reductionNoFluff: createEvalReduction(
            insensResult.reductionNoFluff,
            sensResult.reductionNoFluff,
        ),
        input: insensResult.input,
        dataflow: createEvalSlicerStatsDataflow(
            insensResult.dataflow as SlicerStatsDataflow<SummarizedMeasurement>,
            sensResult.dataflow as SlicerStatsDataflow<SummarizedMeasurement>,
        ),
    };
}

function getEvalValues(insensitiveValue: number, sensitiveValue: number): EvalValues {
    const diff = sensitiveValue - insensitiveValue;
    return {
        insensitiveValue,
        sensitiveValue,
        diff,
        diffRelative: diff / insensitiveValue,
        factor: sensitiveValue / insensitiveValue,
    };
}

function getEvalSummarizedMeasurement(
    insensitiveValue: SummarizedMeasurement,
    sensitiveValue: SummarizedMeasurement,
): EvalSummarizedMeasurement {
    return {
        min: getEvalValues(insensitiveValue.min, sensitiveValue.min),
        max: getEvalValues(insensitiveValue.max, sensitiveValue.max),
        median: getEvalValues(insensitiveValue.median, sensitiveValue.median),
        total: getEvalValues(insensitiveValue.total, sensitiveValue.total),
        mean: getEvalValues(insensitiveValue.mean, sensitiveValue.mean),
        std: getEvalValues(insensitiveValue.std, sensitiveValue.std),
    };
}

function createEvalMap<K>(
    insensMap: Map<K, SummarizedMeasurement>,
    sensMap: Map<K, SummarizedMeasurement>,
): EvalMap<K, EvalSummarizedMeasurement> {
    const result: EvalMap<K, EvalSummarizedMeasurement> = new Map();
    for (const [key, sensValue] of sensMap.entries()) {
        result.set(key, getEvalSummarizedMeasurement(insensMap.get(key), sensValue));
    }
    return result;
}

function getEvalTimePerToken(insensValue: TimePerToken, sensValue: TimePerToken): EvalTimePerToken {
    return {
        raw: getEvalSummarizedMeasurement(insensValue.raw, sensValue.raw),
        normalized: getEvalSummarizedMeasurement(insensValue.normalized, sensValue.normalized),
    };
}

function createEvalReduction(
    insensValue: Reduction<SummarizedMeasurement>,
    sensValue: Reduction<SummarizedMeasurement>,
): EvalReduction {
    return {
        numberOfLines: getEvalSummarizedMeasurement(
            insensValue.numberOfLines,
            sensValue.numberOfLines,
        ),
        numberOfLinesNoAutoSelection: getEvalSummarizedMeasurement(
            insensValue.numberOfLinesNoAutoSelection,
            sensValue.numberOfLinesNoAutoSelection,
        ),
        numberOfCharacters: getEvalSummarizedMeasurement(
            insensValue.numberOfCharacters,
            sensValue.numberOfCharacters,
        ),
        numberOfNonWhitespaceCharacters: getEvalSummarizedMeasurement(
            insensValue.numberOfNonWhitespaceCharacters,
            sensValue.numberOfNonWhitespaceCharacters,
        ),
        numberOfRTokens: getEvalSummarizedMeasurement(
            insensValue.numberOfRTokens,
            sensValue.numberOfRTokens,
        ),
        numberOfNormalizedTokens: getEvalSummarizedMeasurement(
            insensValue.numberOfNormalizedTokens,
            sensValue.numberOfNormalizedTokens,
        ),
        numberOfDataflowNodes: getEvalSummarizedMeasurement(
            insensValue.numberOfDataflowNodes,
            sensValue.numberOfDataflowNodes,
        ),
    };
}

function createEvalSlicerStatsDataflow(
    insensValue: SlicerStatsDataflow<SummarizedMeasurement>,
    sensValue: SlicerStatsDataflow<SummarizedMeasurement>,
): EvalSlicerStatsDataflow {
    const storedVertexIndices = getEvalSummarizedMeasurement(
        insensValue.storedVertexIndices,
        sensValue.storedVertexIndices,
    );
    const storedEnvIndices = getEvalSummarizedMeasurement(
        insensValue.storedEnvIndices,
        sensValue.storedEnvIndices,
    );
    const overwrittenIndices = getEvalSummarizedMeasurement(
        insensValue.overwrittenIndices,
        sensValue.overwrittenIndices,
    );

    return {
        numberOfNodes: getEvalSummarizedMeasurement(
            insensValue.numberOfNodes,
            sensValue.numberOfNodes,
        ),
        numberOfEdges: getEvalSummarizedMeasurement(
            insensValue.numberOfEdges,
            sensValue.numberOfEdges,
        ),
        numberOfCalls: getEvalSummarizedMeasurement(
            insensValue.numberOfCalls,
            sensValue.numberOfCalls,
        ),
        numberOfFunctionDefinitions: getEvalSummarizedMeasurement(
            insensValue.numberOfFunctionDefinitions,
            sensValue.numberOfFunctionDefinitions,
        ),
        sizeOfObject: getEvalSummarizedMeasurement(
            insensValue.sizeOfObject,
            sensValue.sizeOfObject,
        ),
        storedVertexIndices: onlyValues(storedVertexIndices),
        storedEnvIndices: onlyValues(storedEnvIndices),
        overwrittenIndices: onlyValues(overwrittenIndices),
    };
}

function onlyValues(
    summarized: EvalWrapper<SummarizedMeasurement>,
): EvalWrapper<SummarizedMeasurement> {
    function onlyVs(value: EvalValues): EvalValues {
        return {
            insensitiveValue: value.insensitiveValue,
            sensitiveValue: value.sensitiveValue,
        } as EvalValues;
    }

    return {
        min: onlyVs(summarized.min),
        max: onlyVs(summarized.max),
        median: onlyVs(summarized.median),
        total: onlyVs(summarized.total),
        mean: onlyVs(summarized.mean),
        std: onlyVs(summarized.std),
    };
}

export function objectToLaTeX(obj: unknown): string {
    return flattenObject(obj)
        .map(([key, value]) => `\\def\\${key.map(capitalize).join("")}{${value}}`)
        .join("\n");
}

export function flattenObject(
    object: unknown,
    stopAtObject: (object: unknown) => boolean = () => false,
    previousKeys: string[] = [],
): [string[], unknown][] {
    const lines: [string[], unknown][] = [];
    if (stopAtObject(object)) {
        lines.push([previousKeys, object]);
    } else if (object instanceof Map) {
        for (const [key, val] of object.entries()) {
            lines.push(...flattenObject(val, stopAtObject, [...previousKeys, formatKey(key)]));
        }
    } else if (typeof object === "object") {
        for (const key in object) {
            if (Object.hasOwn(object, key)) {
                lines.push(
                    ...flattenObject(object[key], stopAtObject, [...previousKeys, formatKey(key)]),
                );
            }
        }
    } else {
        lines.push([previousKeys, object]);
    }
    return lines;
}

function formatKey(key: string, sep = " ", upper = false): string {
    const parts = key.split(sep);
    return (
        (upper ? "" : parts[0]) +
        parts
            .slice(upper ? 0 : 1)
            .map(capitalize)
            .join("")
    );
}

export function capitalize(text: string): string {
    return text[0].toUpperCase() + text.slice(1);
}

export function printResults(stats: EvalUltimateSlicerStats) {
    const a = flattenObject(stats, isEvalValues).map(
        ([key, value]) => [key.map(capitalize).join(""), value] as [string, unknown],
    );
    const obj = {};
    a.forEach(([key, value]) => {
        if (isEvalValues(value) && key.includes("Mean")) {
            obj[key] = {
                ...value,
                "diffRelative%": Number.isFinite(value.diffRelative)
                    ? asPercentage(value.diffRelative)
                    : "",
                dir: value.diff < 0 ? "↓" : value.diff > 0 ? "↑" : "-",
            };
        } else {
            // logger.info(`${key}: ${JSON.stringify(value)}`);
        }
    });
    console.table(obj);
}

export interface RepoInfo {
    tag: string | undefined;
    commit: string | undefined;
    branch: string | undefined;
}

export interface RepoInfos {
    flowr: RepoInfo;
    ssoc: RepoInfo;
    ssocFileCount: number;
    pointrEval: RepoInfo;
}

export interface DiscoverData {
    repo: RepoInfo;
    files: string[];
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
