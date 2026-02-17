import {
    BenchmarkMemoryMeasurement,
    CommonSlicerMeasurements,
    PerSliceMeasurements,
    SlicerStatsDataflow,
    SlicerStatsInput,
} from "@eagleoutice/flowr/benchmark/stats/stats";
import {
    Reduction,
    SummarizedSlicerStats,
    TimePerToken,
    UltimateSlicerStats,
} from "@eagleoutice/flowr/benchmark/summarizer/data";
import { SummarizedMeasurement, summarizeMeasurement } from "@eagleoutice/flowr/util/summarizer";
import { DefaultMap } from "@eagleoutice/flowr/util/collections/defaultmap";
import fs from "fs";
import {
    summarizeSummarizedMeasurement,
    summarizeSummarizedReductions,
    summarizeSummarizedTimePerToken,
    summarizeTimePerToken,
} from "@eagleoutice/flowr/benchmark/summarizer/first-phase/process";
import { logger } from "../logger";
import {
    EvalMap,
    EvalRawValues,
    EvalReduction,
    EvalSlicerStatsDataflow,
    EvalSummarizedMeasurement,
    EvalTimePerToken,
    EvalUltimateSlicerStats,
    EvalValues,
} from "../model/flowr-models";

export function processSummarizedRunMeasurement(
    fileName: string,
    summarizedFiles: string[],
    appendPath: string,
) {
    logger.silly(`Summarizing all run statistics for file ${fileName}`);

    const summaries: SummarizedSlicerStats[] = [];
    for (const file of summarizedFiles) {
        processNextSummary(fs.readFileSync(file), summaries);
    }

    fs.appendFileSync(
        appendPath,
        `${JSON.stringify(summarizeAllSummarizedStats(summaries), jsonReplacer)}\n`,
    );
    logger.silly(`Appended summary of file ${fileName} to ${appendPath}`);
}

function processNextSummary(line: Buffer, allSummarized: SummarizedSlicerStats[]): void {
    let got = JSON.parse(line.toString()) as { summarize: SummarizedSlicerStats };
    got = {
        summarize: {
            ...got.summarize,
            // restore maps
            memory: new Map(
                (
                    got.summarize.memory as unknown as [
                        CommonSlicerMeasurements,
                        BenchmarkMemoryMeasurement,
                    ][]
                ).map(([k, v]) => [k, v]),
            ),
            commonMeasurements: new Map(
                (
                    got.summarize.commonMeasurements as unknown as [
                        CommonSlicerMeasurements,
                        string,
                    ][]
                ).map(([k, v]) => {
                    return [k, BigInt(v.slice(0, -1))];
                }),
            ),
            perSliceMeasurements: {
                ...got.summarize.perSliceMeasurements,
                // restore maps
                measurements: new Map(
                    got.summarize.perSliceMeasurements.measurements as unknown as [
                        PerSliceMeasurements,
                        SummarizedMeasurement,
                    ][],
                ),
            },
        },
    };
    allSummarized.push(got.summarize);
}

function summarizeAllSummarizedStats(stats: SummarizedSlicerStats[]): UltimateSlicerStats {
    const commonMeasurements = new DefaultMap<CommonSlicerMeasurements, number[]>(() => []);
    const perSliceMeasurements = new DefaultMap<PerSliceMeasurements, SummarizedMeasurement[]>(
        () => [],
    );
    const sliceTimesPerToken: TimePerToken[] = [];
    const reconstructTimesPerToken: TimePerToken[] = [];
    const totalPerSliceTimesPerToken: TimePerToken[] = [];
    const retrieveTimesPerToken: TimePerToken<number>[] = [];
    const normalizeTimesPerToken: TimePerToken<number>[] = [];
    const dataflowTimesPerToken: TimePerToken<number>[] = [];
    const totalCommonTimesPerToken: TimePerToken<number>[] = [];
    const memory = new DefaultMap<CommonSlicerMeasurements, BenchmarkMemoryMeasurement[]>(() => []);
    const reductions: Reduction<SummarizedMeasurement>[] = [];
    const reductionsNoFluff: Reduction<SummarizedMeasurement>[] = [];
    const inputs: SlicerStatsInput[] = [];
    const dataflows: SlicerStatsDataflow[] = [];
    let failedToRepParse = 0;
    let timesHitThreshold = 0;
    let totalSlices = 0;

    for (const stat of stats) {
        for (const [k, v] of stat.commonMeasurements) {
            commonMeasurements.get(k).push(Number(v));
        }
        for (const [k, v] of stat.perSliceMeasurements.measurements) {
            perSliceMeasurements.get(k).push(v);
        }
        sliceTimesPerToken.push(stat.perSliceMeasurements.sliceTimePerToken);
        reconstructTimesPerToken.push(stat.perSliceMeasurements.reconstructTimePerToken);
        totalPerSliceTimesPerToken.push(stat.perSliceMeasurements.totalPerSliceTimePerToken);
        retrieveTimesPerToken.push(stat.retrieveTimePerToken);
        normalizeTimesPerToken.push(stat.normalizeTimePerToken);
        dataflowTimesPerToken.push(stat.dataflowTimePerToken);
        totalCommonTimesPerToken.push(stat.totalCommonTimePerToken);
        for (const [k, v] of stat.memory) {
            memory.get(k).push(v);
        }
        reductions.push(stat.perSliceMeasurements.reduction);
        reductionsNoFluff.push(stat.perSliceMeasurements.reductionNoFluff);
        inputs.push(stat.input);
        dataflows.push(stat.dataflow as SlicerStatsDataflow);
        failedToRepParse += stat.perSliceMeasurements.failedToRepParse;
        totalSlices += stat.perSliceMeasurements.numberOfSlices;
        timesHitThreshold += stat.perSliceMeasurements.timesHitThreshold;
    }

    return {
        totalRequests: stats.length,
        totalSlices: totalSlices,
        commonMeasurements: new Map(
            [...commonMeasurements.entries()].map(([k, v]) => [k, summarizeMeasurement(v)]),
        ),
        perSliceMeasurements: new Map(
            [...perSliceMeasurements.entries()].map(([k, v]) => [
                k,
                summarizeSummarizedMeasurement(v),
            ]),
        ),
        sliceTimePerToken: summarizeSummarizedTimePerToken(sliceTimesPerToken),
        reconstructTimePerToken: summarizeSummarizedTimePerToken(reconstructTimesPerToken),
        totalPerSliceTimePerToken: summarizeSummarizedTimePerToken(totalPerSliceTimesPerToken),
        retrieveTimePerToken: summarizeTimePerToken(retrieveTimesPerToken),
        normalizeTimePerToken: summarizeTimePerToken(normalizeTimesPerToken),
        dataflowTimePerToken: summarizeTimePerToken(dataflowTimesPerToken),
        totalCommonTimePerToken: summarizeTimePerToken(totalCommonTimesPerToken),
        failedToRepParse,
        timesHitThreshold,
        reduction: summarizeSummarizedReductions(reductions),
        reductionNoFluff: summarizeSummarizedReductions(reductionsNoFluff),
        input: {
            numberOfLines: summarizeMeasurement(inputs.map((i) => i.numberOfLines)),
            numberOfNonEmptyLines: summarizeMeasurement(inputs.map((i) => i.numberOfNonEmptyLines)),
            numberOfCharacters: summarizeMeasurement(inputs.map((i) => i.numberOfCharacters)),
            numberOfCharactersNoComments: summarizeMeasurement(
                inputs.map((i) => i.numberOfCharactersNoComments),
            ),
            numberOfNonWhitespaceCharacters: summarizeMeasurement(
                inputs.map((i) => i.numberOfNonWhitespaceCharacters),
            ),
            numberOfNonWhitespaceCharactersNoComments: summarizeMeasurement(
                inputs.map((i) => i.numberOfNonWhitespaceCharactersNoComments),
            ),
            numberOfRTokens: summarizeMeasurement(inputs.map((i) => i.numberOfRTokens)),
            numberOfRTokensNoComments: summarizeMeasurement(
                inputs.map((i) => i.numberOfRTokensNoComments),
            ),
            numberOfNormalizedTokens: summarizeMeasurement(
                inputs.map((i) => i.numberOfNormalizedTokens),
            ),
            numberOfNormalizedTokensNoComments: summarizeMeasurement(
                inputs.map((i) => i.numberOfNormalizedTokensNoComments),
            ),
        },
        dataflow: {
            numberOfNodes: summarizeMeasurement(dataflows.map((d) => d.numberOfNodes)),
            numberOfFunctionDefinitions: summarizeMeasurement(
                dataflows.map((d) => d.numberOfFunctionDefinitions),
            ),
            numberOfCalls: summarizeMeasurement(dataflows.map((d) => d.numberOfCalls)),
            numberOfEdges: summarizeMeasurement(dataflows.map((d) => d.numberOfEdges)),
            sizeOfObject: summarizeMeasurement(dataflows.map((d) => d.sizeOfObject)),
            storedVertexIndices: summarizeMeasurement(dataflows.map((d) => d.storedVertexIndices)),
            storedEnvIndices: summarizeMeasurement(dataflows.map((d) => d.storedEnvIndices)),
            overwrittenIndices: summarizeMeasurement(dataflows.map((d) => d.overwrittenIndices)),
        },
    };
}

function jsonReplacer(key: unknown, value: unknown): unknown {
    if (key === "fullLexeme") {
        return undefined;
    } else if (value instanceof Map || value instanceof Set) {
        return [...value];
    } else if (typeof value === "bigint") {
        return `${value.toString()}n`;
    } else {
        return value;
    }
}

export function createUltimateEvalStats<A extends string, B extends string>(
    keyA: A,
    resultA: UltimateSlicerStats,
    keyB: B,
    resultB: UltimateSlicerStats,
): EvalUltimateSlicerStats<A, B> {
    return {
        totalRequests: {
            [keyA]: resultA.totalRequests,
            [keyB]: resultB.totalRequests,
        } as EvalRawValues<A, B>,
        totalSlices: {
            [keyA]: resultA.totalSlices,
            [keyB]: resultB.totalSlices,
        } as EvalRawValues<A, B>,
        commonMeasurements: createEvalMap(
            keyA,
            resultA.commonMeasurements,
            keyB,
            resultB.commonMeasurements,
        ),
        perSliceMeasurements: createEvalMap(
            keyA,
            resultA.perSliceMeasurements,
            keyB,
            resultB.perSliceMeasurements,
        ),
        retrieveTimePerToken: getEvalTimePerToken(
            keyA,
            resultA.retrieveTimePerToken,
            keyB,
            resultB.retrieveTimePerToken,
        ),
        normalizeTimePerToken: getEvalTimePerToken(
            keyA,
            resultA.normalizeTimePerToken,
            keyB,
            resultB.normalizeTimePerToken,
        ),
        dataflowTimePerToken: getEvalTimePerToken(
            keyA,
            resultA.dataflowTimePerToken,
            keyB,
            resultB.dataflowTimePerToken,
        ),
        totalCommonTimePerToken: getEvalTimePerToken(
            keyA,
            resultA.totalCommonTimePerToken,
            keyB,
            resultB.totalCommonTimePerToken,
        ),
        sliceTimePerToken: getEvalTimePerToken(
            keyA,
            resultA.sliceTimePerToken,
            keyB,
            resultB.sliceTimePerToken,
        ),
        reconstructTimePerToken: getEvalTimePerToken(
            keyA,
            resultA.reconstructTimePerToken,
            keyB,
            resultB.reconstructTimePerToken,
        ),
        totalPerSliceTimePerToken: getEvalTimePerToken(
            keyA,
            resultA.totalPerSliceTimePerToken,
            keyB,
            resultB.totalPerSliceTimePerToken,
        ),
        failedToRepParse: getEvalValues(
            keyA,
            resultA.failedToRepParse,
            keyB,
            resultB.failedToRepParse,
        ),
        timesHitThreshold: getEvalValues(
            keyA,
            resultA.timesHitThreshold,
            keyB,
            resultB.timesHitThreshold,
        ),
        reduction: createEvalReduction(keyA, resultA.reduction, keyB, resultB.reduction),
        reductionNoFluff: createEvalReduction(
            keyA,
            resultA.reductionNoFluff,
            keyB,
            resultB.reductionNoFluff,
        ),
        input: resultA.input,
        dataflow: createEvalSlicerStatsDataflow(keyA, resultA.dataflow, keyB, resultB.dataflow),
    };
}

function getEvalValues<A extends string, B extends string>(
    keyA: A,
    valueA: number,
    keyB: B,
    valueB: number,
): EvalValues<A, B> {
    const diff = valueB - valueA;
    return {
        [keyA]: valueA,
        [keyB]: valueB,
        diff,
        diffRelative: diff / valueA,
        factor: valueB / valueA,
    } as EvalValues<A, B>;
}

function getEvalSummarizedMeasurement<A extends string, B extends string>(
    keyA: A,
    valueA: SummarizedMeasurement,
    keyB: B,
    valueB: SummarizedMeasurement,
): EvalSummarizedMeasurement<A, B> {
    return {
        min: getEvalValues(keyA, valueA.min, keyB, valueB.min),
        max: getEvalValues(keyA, valueA.max, keyB, valueB.max),
        mean: getEvalValues(keyA, valueA.mean, keyB, valueB.mean),
        median: getEvalValues(keyA, valueA.median, keyB, valueB.median),
        std: getEvalValues(keyA, valueA.std, keyB, valueB.std),
        total: getEvalValues(keyA, valueA.total, keyB, valueB.total),
    };
}

function createEvalMap<K, A extends string, B extends string>(
    keyA: A,
    mapA: Map<K, SummarizedMeasurement>,
    keyB: B,
    mapB: Map<K, SummarizedMeasurement>,
): EvalMap<K, EvalSummarizedMeasurement<A, B>, A, B> {
    const result: EvalMap<K, EvalSummarizedMeasurement<A, B>, A, B> = new Map();
    for (const [key, valueB] of mapB.entries()) {
        result.set(key, getEvalSummarizedMeasurement(keyA, mapA.get(key), keyB, valueB));
    }
    return result;
}

function getEvalTimePerToken<A extends string, B extends string>(
    keyA: A,
    valueA: TimePerToken,
    keyB: B,
    valueB: TimePerToken,
): EvalTimePerToken<A, B> {
    return {
        raw: getEvalSummarizedMeasurement(keyA, valueA.raw, keyB, valueB.raw),
        normalized: getEvalSummarizedMeasurement(keyA, valueA.normalized, keyB, valueB.normalized),
    };
}

function createEvalReduction<A extends string, B extends string>(
    keyA: A,
    valueA: Reduction<SummarizedMeasurement>,
    keyB: B,
    valueB: Reduction<SummarizedMeasurement>,
): EvalReduction<A, B> {
    return {
        numberOfLines: getEvalSummarizedMeasurement(
            keyA,
            valueA.numberOfLines,
            keyB,
            valueB.numberOfLines,
        ),
        numberOfLinesNoAutoSelection: getEvalSummarizedMeasurement(
            keyA,
            valueA.numberOfLinesNoAutoSelection,
            keyB,
            valueB.numberOfLinesNoAutoSelection,
        ),
        numberOfCharacters: getEvalSummarizedMeasurement(
            keyA,
            valueA.numberOfCharacters,
            keyB,
            valueB.numberOfCharacters,
        ),
        numberOfNonWhitespaceCharacters: getEvalSummarizedMeasurement(
            keyA,
            valueA.numberOfNonWhitespaceCharacters,
            keyB,
            valueB.numberOfNonWhitespaceCharacters,
        ),
        numberOfRTokens: getEvalSummarizedMeasurement(
            keyA,
            valueA.numberOfRTokens,
            keyB,
            valueB.numberOfRTokens,
        ),
        numberOfNormalizedTokens: getEvalSummarizedMeasurement(
            keyA,
            valueA.numberOfNormalizedTokens,
            keyB,
            valueB.numberOfNormalizedTokens,
        ),
        numberOfDataflowNodes: getEvalSummarizedMeasurement(
            keyA,
            valueA.numberOfDataflowNodes,
            keyB,
            valueB.numberOfDataflowNodes,
        ),
    };
}

function createEvalSlicerStatsDataflow<A extends string, B extends string>(
    keyA: A,
    valueA: SlicerStatsDataflow<SummarizedMeasurement>,
    keyB: B,
    valueB: SlicerStatsDataflow<SummarizedMeasurement>,
): EvalSlicerStatsDataflow<A, B> {
    return {
        numberOfNodes: getEvalSummarizedMeasurement(
            keyA,
            valueA.numberOfNodes,
            keyB,
            valueB.numberOfNodes,
        ),
        numberOfEdges: getEvalSummarizedMeasurement(
            keyA,
            valueA.numberOfEdges,
            keyB,
            valueB.numberOfEdges,
        ),
        numberOfCalls: getEvalSummarizedMeasurement(
            keyA,
            valueA.numberOfCalls,
            keyB,
            valueB.numberOfCalls,
        ),
        numberOfFunctionDefinitions: getEvalSummarizedMeasurement(
            keyA,
            valueA.numberOfFunctionDefinitions,
            keyB,
            valueB.numberOfFunctionDefinitions,
        ),
        sizeOfObject: getEvalSummarizedMeasurement(
            keyA,
            valueA.sizeOfObject,
            keyB,
            valueB.sizeOfObject,
        ),
        storedVertexIndices: getEvalSummarizedMeasurement(
            keyA,
            valueA.storedVertexIndices,
            keyB,
            valueB.storedVertexIndices,
        ),
        storedEnvIndices: getEvalSummarizedMeasurement(
            keyA,
            valueA.storedEnvIndices,
            keyB,
            valueB.storedEnvIndices,
        ),
        overwrittenIndices: getEvalSummarizedMeasurement(
            keyA,
            valueA.overwrittenIndices,
            keyB,
            valueB.overwrittenIndices,
        ),
    };
}
