import {
    CommonSlicerMeasurements,
    PerSliceMeasurements,
    SlicerStatsDataflow,
    SlicerStatsInput,
} from "@eagleoutice/flowr/benchmark/stats/stats";
import { Reduction, TimePerToken } from "@eagleoutice/flowr/benchmark/summarizer/data";
import { SummarizedMeasurement } from "@eagleoutice/flowr/util/summarizer";

export type EvalValues<A extends string, B extends string> = EvalRawValues<A, B> & {
    diff: number;
    diffRelative: number;
    factor: number;
};

export type EvalRawValues<A extends string, B extends string> = {
    [K in A | B]: number;
};

export type EvalWrapper<T, A extends string, B extends string> = {
    [P in keyof T]: EvalValues<A, B>;
};

export type EvalMap<K, V, A extends string, B extends string> = Map<K, EvalWrapper<V, A, B>>;
export type EvalSummarizedMeasurement<A extends string, B extends string> = EvalWrapper<
    SummarizedMeasurement,
    A,
    B
>;
export type EvalReduction<A extends string, B extends string> = Reduction<
    EvalSummarizedMeasurement<A, B>
>;
export type EvalSlicerStatsDataflow<A extends string, B extends string> = SlicerStatsDataflow<
    EvalSummarizedMeasurement<A, B>
>;
export type EvalTimePerToken<A extends string, B extends string> = TimePerToken<
    EvalSummarizedMeasurement<A, B>
>;

export interface EvalUltimateSlicerStats<A extends string, B extends string> {
    totalRequests: EvalRawValues<A, B>;
    totalSlices: EvalRawValues<A, B>;
    commonMeasurements: EvalMap<CommonSlicerMeasurements, EvalSummarizedMeasurement<A, B>, A, B>;
    perSliceMeasurements: EvalMap<PerSliceMeasurements, EvalSummarizedMeasurement<A, B>, A, B>;
    retrieveTimePerToken: EvalTimePerToken<A, B>;
    normalizeTimePerToken: EvalTimePerToken<A, B>;
    dataflowTimePerToken: EvalTimePerToken<A, B>;
    totalCommonTimePerToken: EvalTimePerToken<A, B>;
    sliceTimePerToken: EvalTimePerToken<A, B>;
    reconstructTimePerToken: EvalTimePerToken<A, B>;
    totalPerSliceTimePerToken: EvalTimePerToken<A, B>;
    failedToRepParse: EvalValues<A, B>;
    timesHitThreshold: EvalValues<A, B>;
    reduction: EvalReduction<A, B>;
    reductionNoFluff: EvalReduction<A, B>;
    input: SlicerStatsInput<SummarizedMeasurement>;
    dataflow: EvalSlicerStatsDataflow<A, B>;
}
