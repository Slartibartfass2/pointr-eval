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

type EvalValues = {
    insensitiveValue: number;
    sensitiveValue: number;
    diff: number;
    diffRelative: number;
};

type EvalWrapper<T> = {
    [P in keyof T]: EvalValues;
};

// Define up-to-date types from the flowr package
interface SlicerStatsDataflow<T = number> {
    numberOfNodes: T;
    numberOfEdges: T;
    numberOfCalls: T;
    numberOfFunctionDefinitions: T;
    /* size of object in bytes as measured by v8 serialization */
    sizeOfObject: T;
    storedVertexIndices: T;
    storedEnvIndices: T;
    overwrittenIndices: T;
}

type EvalMap<K, V> = Map<K, EvalWrapper<V>>;
type EvalSummarizedMeasurement = EvalWrapper<SummarizedMeasurement>;
type EvalReduction = Reduction<EvalSummarizedMeasurement>;
type EvalSlicerStatsDataflow = SlicerStatsDataflow<EvalSummarizedMeasurement>;
type EvalTimePerToken = TimePerToken<EvalSummarizedMeasurement>;

export interface EvalUltimateSlicerStats {
    totalRequests: number;
    totalSlices: number;
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
        totalRequests: insensResult.totalRequests,
        totalSlices: insensResult.totalSlices,
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
    return {
        insensitiveValue,
        sensitiveValue,
        diff: sensitiveValue - insensitiveValue,
        diffRelative: (sensitiveValue - insensitiveValue) / insensitiveValue,
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
        storedVertexIndices: getEvalSummarizedMeasurement(
            insensValue.storedVertexIndices,
            sensValue.storedVertexIndices,
        ),
        storedEnvIndices: getEvalSummarizedMeasurement(
            insensValue.storedEnvIndices,
            sensValue.storedEnvIndices,
        ),
        overwrittenIndices: getEvalSummarizedMeasurement(
            insensValue.overwrittenIndices,
            sensValue.overwrittenIndices,
        ),
    };
}

export function statsToLaTeX(stats: EvalUltimateSlicerStats): string {
    return serializeObject(stats)
        .map(([key, value]) => `\\def\\${formatKey(key, "_", true)}{${value}}`)
        .join("\n");
}

function serializeObject(object: unknown, prevPrefix = ""): [string, string][] {
    const lines: [string, string][] = [];
    const prefix = prevPrefix ? `${prevPrefix}_` : "";
    if (object instanceof Map) {
        for (const [key, val] of object.entries()) {
            lines.push(...serializeObject(val, `${prefix}${formatKey(key)}`));
        }
    } else if (typeof object === "object") {
        for (const key in object) {
            if (Object.hasOwn(object, key)) {
                lines.push(...serializeObject(object[key], `${prefix}${formatKey(key)}`));
            }
        }
    } else {
        lines.push([prevPrefix, `${JSON.stringify(object)}`]);
    }
    return lines;
}

function formatKey(key: string, sep = " ", upper = false): string {
    const parts = key.split(sep);
    return (
        (upper ? "" : parts[0]) +
        parts
            .slice(upper ? 0 : 1)
            .map((part) => part[0].toUpperCase() + part.slice(1))
            .join("")
    );
}
