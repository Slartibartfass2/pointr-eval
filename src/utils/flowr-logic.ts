import {
    BenchmarkMemoryMeasurement,
    CommonSlicerMeasurements,
    PerSliceMeasurements,
    SlicerStatsInput,
} from "@eagleoutice/flowr/benchmark/stats/stats";
import {
    Reduction,
    SummarizedSlicerStats,
    TimePerToken,
    UltimateSlicerStats,
} from "@eagleoutice/flowr/benchmark/summarizer/data";
import { SummarizedMeasurement, summarizeMeasurement } from "@eagleoutice/flowr/util/summarizer";
import { DefaultMap } from "@eagleoutice/flowr/util/defaultmap";
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
    EvalReduction,
    EvalSlicerStatsDataflow,
    EvalSummarizedMeasurement,
    EvalTimePerToken,
    EvalUltimateSlicerStats,
    EvalValues,
    EvalWrapper,
    SlicerStatsDataflow,
} from "../model/flowr-models";

export function isEvalValues(value: unknown): value is EvalValues {
    return (
        typeof value === "object" &&
        value !== null &&
        "insensitiveValue" in value &&
        "sensitiveValue" in value
    );
}

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

export function processNextSummary(line: Buffer, allSummarized: SummarizedSlicerStats[]): void {
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

export function summarizeAllSummarizedStats(stats: SummarizedSlicerStats[]): UltimateSlicerStats {
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
