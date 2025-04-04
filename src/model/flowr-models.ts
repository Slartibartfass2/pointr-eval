import {
    CommonSlicerMeasurements,
    PerSliceMeasurements,
    SlicerStatsInput,
} from "@eagleoutice/flowr/benchmark/stats/stats";
import { Reduction, TimePerToken } from "@eagleoutice/flowr/benchmark/summarizer/data";
import { SummarizedMeasurement } from "@eagleoutice/flowr/util/summarizer";

// TODO: overwrite when flowr package is updated
export interface SlicerStatsDataflow<T = number> {
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

export type EvalValues = {
    insensitiveValue: number;
    sensitiveValue: number;
    diff: number;
    diffRelative: number;
    factor: number;
};

export type EvalWrapper<T> = {
    [P in keyof T]: EvalValues;
};

export type EvalMap<K, V> = Map<K, EvalWrapper<V>>;
export type EvalSummarizedMeasurement = EvalWrapper<SummarizedMeasurement>;
export type EvalReduction = Reduction<EvalSummarizedMeasurement>;
export type EvalSlicerStatsDataflow = SlicerStatsDataflow<EvalSummarizedMeasurement>;
export type EvalTimePerToken = TimePerToken<EvalSummarizedMeasurement>;

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

export interface UltimateSlicerStats {
    totalRequests: number;
    totalSlices: number;
    commonMeasurements: Map<CommonSlicerMeasurements, SummarizedMeasurement>;
    perSliceMeasurements: Map<PerSliceMeasurements, SummarizedMeasurement>;
    retrieveTimePerToken: TimePerToken;
    normalizeTimePerToken: TimePerToken;
    dataflowTimePerToken: TimePerToken;
    totalCommonTimePerToken: TimePerToken;
    sliceTimePerToken: TimePerToken;
    reconstructTimePerToken: TimePerToken;
    totalPerSliceTimePerToken: TimePerToken;
    /** sum */
    failedToRepParse: number;
    /** sum */
    timesHitThreshold: number;
    reduction: Reduction<SummarizedMeasurement>;
    /** reduction, but without taking into account comments and empty lines */
    reductionNoFluff: Reduction<SummarizedMeasurement>;
    input: SlicerStatsInput<SummarizedMeasurement>;
    dataflow: SlicerStatsDataflow<SummarizedMeasurement>;
}
