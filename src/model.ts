import { SlicerStats, SlicerStatsDataflow } from "@eagleoutice/flowr/benchmark/stats/stats";
import { DataflowInformation } from "@eagleoutice/flowr/dataflow/info";

export type EvalStats = SlicerStatsDataflow &
    Pick<SlicerStats, "perSliceMeasurements"> & {
        dataflow: DataflowInformation;
    };

export interface CompareOptions<T> {
    isFloat: boolean | ((stat: T) => boolean);
    statValues: (stat: T, insensitiveValue: number, sensitiveValue: number) => void;
}

export interface TotalStats {
    total: number;
    "static slicing": number;
    "reconstruct code": number;
    reducedLines: number;
    reducedLinePercentage: number;
}

export function defaultTotalStats(): TotalStats {
    return {
        total: 0,
        "static slicing": 0,
        "reconstruct code": 0,
        reducedLines: 0,
        reducedLinePercentage: 0,
    };
}
