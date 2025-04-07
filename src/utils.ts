import { UltimateSlicerStats } from "@eagleoutice/flowr/benchmark/summarizer/data";
import { EvalUltimateSlicerStats } from "./model/flowr-models";
import { readJsonFile, writeJsonFile } from "./utils/fs-helper";

export function readUltimateStats(path: string): UltimateSlicerStats {
    return readJsonFile<UltimateSlicerStats>(path, statsReviver);
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

export function writeUltimateStats<A extends string, B extends string>(
    stats: UltimateSlicerStats | EvalUltimateSlicerStats<A, B>,
    path: string,
): void {
    writeJsonFile(path, stats, statsReplacer);
}

function statsReplacer<T>(key: string, value: T) {
    if (value instanceof Map) {
        return Array.from(value.entries());
    }
    return value;
}
