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
import { logger } from "./logger";

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

interface UltimateSlicerStats {
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

export function processSummarizedRunMeasurement(
    fileName: string,
    summarizedFiles: string[],
    appendPath: string,
) {
    logger.verbose(`Summarizing all run statistics for file ${fileName}`);

    const summaries: SummarizedSlicerStats[] = [];
    for (const file of summarizedFiles) {
        processNextSummary(fs.readFileSync(file), summaries);
    }

    fs.appendFileSync(
        appendPath,
        `${JSON.stringify(summarizeAllSummarizedStats(summaries), jsonReplacer)}\n`,
    );
    logger.verbose(`Appended summary of file ${fileName} to ${appendPath}`);
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
