import { SlicerStats, SlicerStatsDataflow } from "@eagleoutice/flowr/benchmark/stats/stats";

export type EvalStats = SlicerStatsDataflow & Pick<SlicerStats, "perSliceMeasurements">;
