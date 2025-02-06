import { logger } from "./logger";
import { promises as fs } from "fs";
import { setConfigFile } from "@eagleoutice/flowr/config";
import { BenchmarkSlicer, BenchmarkSlicerStats } from "@eagleoutice/flowr/benchmark/slicer";
import { DefaultAllVariablesFilter } from "@eagleoutice/flowr/slicing/criterion/filters/all-variables";
import { requestFromInput } from "@eagleoutice/flowr/r-bridge/retriever";
import { CompareOptions, defaultTotalStats, EvalStats, TotalStats } from "./model";
import { replacer } from "./utils";
import { PerSliceStats, SlicerStatsDataflow } from "@eagleoutice/flowr/benchmark/stats/stats";
import { CommandLineOptions } from "command-line-args";
import {
    IdentifierReference,
    InGraphIdentifierDefinition,
} from "@eagleoutice/flowr/dataflow/environments/identifier";
import {
    ContainerIndicesCollection,
    isParentContainerIndex,
} from "@eagleoutice/flowr/dataflow/graph/vertex";

export class FileProcessor {
    parsedOptions: CommandLineOptions;
    path: string;
    fileName: string;
    resultPath: string;

    constructor(parsedOptions: CommandLineOptions, path: string) {
        this.parsedOptions = parsedOptions;
        this.path = path;
        const paths = path.split("/");
        const directoryPath = paths.slice(0, -1).join("/");
        const filePath = paths.pop();

        this.fileName = filePath?.replace(".r", "");
        if (!this.fileName) {
            throw new Error(`Could not extract file name of ${path}`);
        }

        this.resultPath = `${directoryPath}/${this.fileName}`;
    }

    async processFile() {
        logger.info(`Processing file: ${this.path}`);

        let rcode: string;
        try {
            rcode = await fs.readFile(this.path, "utf8");
        } catch (error) {
            throw new Error(`Could not read file ${this.path}`, { cause: error });
        }
        const totalLineCount = rcode.split("\n").length + 1;

        // Running analysis with and without pointer analysis

        // without pointer analysis
        logger.info(`Running analysis without pointr for ${this.path}`);
        setConfigFile("flowr-no-pointr.json");
        const resultsInsensitive = await this.sliceForFile(rcode);
        logger.info(`Finished analysis without pointr for ${this.path}`);
        await this.storeResult(resultsInsensitive, false);
        const summaryInsensitive = this.summarizeResult(resultsInsensitive);

        // with pointer analysis
        logger.info(`Running analysis with pointr for ${this.path}`);
        setConfigFile("flowr-pointr.json");
        const resultSensitive = await this.sliceForFile(rcode);
        logger.info(`Finished analysis with pointr for ${this.path}`);
        await this.storeResult(resultSensitive, true);
        const summarySensitive = this.summarizeResult(resultSensitive);

        this.compareResults(totalLineCount, summaryInsensitive, summarySensitive);
    }

    private async sliceForFile(fileContent: string) {
        const bench = new BenchmarkSlicer("r-shell");
        await bench.init(requestFromInput(fileContent));

        try {
            const numberOfSlices = await bench.sliceForAll(DefaultAllVariablesFilter);
            logger.debug(`Processed ${numberOfSlices} slices for ${this.path}`);
        } catch (error) {
            throw new Error(`Error during slicing of ${this.path}`, { cause: error });
        }

        return bench.finish();
    }

    private async storeResult(result: BenchmarkSlicerStats, isSensitive: boolean) {
        const outPath = `${this.resultPath}-${isSensitive ? "sensitive" : "insensitive"}.json`;
        // console.log(this.resultPath, result.stats.perSliceMeasurements.entries());
        result = {
            ...result,
            stats: {
                ...result.stats,
                request: {
                    ...result.stats.request,
                    content: "",
                },
            },
            parse: "",
            normalize: {
                ...result.normalize,
                ast: {
                    ...result.normalize.ast,
                    children: [],
                },
            },
            dataflow: {
                ...result.dataflow,
                environment: {
                    ...result.dataflow.environment,
                    current: {
                        ...result.dataflow.environment.current,
                        parent: {
                            ...result.dataflow.environment.current.parent,
                            memory: new Map(),
                        },
                        memory: new Map(),
                    },
                },
            },
        };
        await fs.writeFile(outPath, JSON.stringify(result, replacer));
    }

    private summarizeResult(result: BenchmarkSlicerStats): EvalStats {
        const { stats, /*parse, normalize,*/ dataflow } = result;
        const { /*commonMeasurements,*/ perSliceMeasurements, dataflow: dataflowStats } = stats;

        return {
            ...dataflowStats,
            perSliceMeasurements,
            dataflow,
        };
    }

    private compareResults(
        totalLineCount: number,
        resultInsensitive: EvalStats,
        resultSensitive: EvalStats,
    ) {
        const numberStats: (keyof SlicerStatsDataflow<number> | "definedIndices")[] = [
            "numberOfNodes",
            "numberOfEdges",
            "numberOfCalls",
            "numberOfFunctionDefinitions",
            "sizeOfObject",
            "definedIndices",
        ] as const;

        const comparison = [];
        comparison.push(`=== Dataflow stats: ===`);
        function bar(stat: (typeof numberStats)[0], stats: EvalStats): number {
            if (stat === "definedIndices") {
                return countDefinedIndices(stats.dataflow.out);
            } else {
                return stats[stat];
            }
        }
        comparison.push(
            ...this.generateGroupStats(
                numberStats,
                (stat) => bar(stat, resultInsensitive),
                (stat) => bar(stat, resultSensitive),
            ),
        );

        const sliceStats: (keyof TotalStats)[] = [
            "total",
            "static slicing",
            "reconstruct code",
            "reducedLines",
            "reducedLinePercentage",
        ];
        const totalSensitiveStats: TotalStats = defaultTotalStats();
        const totalInsensitiveStats: TotalStats = defaultTotalStats();
        const insensitiveMeasurements = resultInsensitive.perSliceMeasurements;
        for (const [[criterion], insensitivePerSliceStats] of insensitiveMeasurements.entries()) {
            const sensitivePerSliceStats = resultSensitive.perSliceMeasurements
                .entries()
                .find(([criteria]) => criterion === criteria[0])[1];
            if (!sensitivePerSliceStats) {
                logger.warn(`${this.fileName}: No sensitive stats for ${criterion}`);
                continue;
            }

            function foo(stat: (typeof sliceStats)[0], stats: PerSliceStats): number {
                if (stat === "reducedLines") {
                    return totalLineCount - stats.reconstructedCode.code.split("\n").length + 1;
                } else if (stat === "reducedLinePercentage") {
                    return (
                        ((stats.reconstructedCode.code.split("\n").length + 1) / totalLineCount) *
                        100
                    );
                } else {
                    return parseInt(stats.measurements.get(stat).toString()) / 1000;
                }
            }
            const perSliceComparison = this.generateGroupStats(
                sliceStats,
                (stat) => foo(stat, insensitivePerSliceStats),
                (stat) => foo(stat, sensitivePerSliceStats),
                {
                    isFloat: (stat) => stat !== "reducedLines",
                    statValues: (stat, insensitiveValue, sensitiveValue) => {
                        totalSensitiveStats[stat] += sensitiveValue;
                        totalInsensitiveStats[stat] += insensitiveValue;
                    },
                },
            );

            if (this.parsedOptions.debug) {
                comparison.push(`=== Per slice stats for ${criterion}: ===`);
                comparison.push(...perSliceComparison);
            }
        }

        comparison.push(`=== Total runtime stats (ms): ===`);
        function foo(stat: (typeof sliceStats)[0], stats: TotalStats, factor: number = 1): number {
            if (stat === "reducedLines" || stat === "reducedLinePercentage") {
                return stats[stat] / factor;
            } else {
                return stats[stat] / 1000 / factor;
            }
        }
        comparison.push(
            ...this.generateGroupStats(
                sliceStats,
                (stat) => foo(stat, totalInsensitiveStats),
                (stat) => foo(stat, totalSensitiveStats),
                { isFloat: true },
            ),
        );

        comparison.push(`=== Avg runtime stats (ms): ===`);
        comparison.push(
            ...this.generateGroupStats(
                sliceStats,
                (stat) => foo(stat, totalInsensitiveStats, insensitiveMeasurements.size),
                (stat) => foo(stat, totalSensitiveStats, insensitiveMeasurements.size),
                { isFloat: true },
            ),
        );

        logger.info(`Comparison of results for ${this.path}:\n${comparison.join("\n")}\n`);
    }

    private compareNumberStat(
        name: string,
        insensitive: number,
        sensitive: number,
        isFloat: boolean = false,
    ) {
        let diff = insensitive - sensitive;
        let diffPercentage = (diff / insensitive) * 100;

        let change = "---";
        if (diff !== 0) {
            diff *= -1;
            diffPercentage *= -1;
            const diffStr = isFloat ? diff.toFixed(2) : diff.toString();
            change = `(${diffStr}/${diffPercentage.toFixed(2)}%)`;
        }

        const insensitiveStr = isFloat ? insensitive.toFixed(2) : insensitive.toString();
        const sensitiveStr = isFloat ? sensitive.toFixed(2) : sensitive.toString();

        return [name, insensitiveStr, sensitiveStr, change];
    }

    private generateGroupStats<T>(
        statNames: T[],
        getInsensitiveValue: (stat: T) => number,
        getSensitiveValue: (stat: T) => number,
        options: Partial<CompareOptions<T>> = {},
    ) {
        const { isFloat = false, statValues = () => {} } = options;

        const comparisons = [];
        for (const stat of statNames) {
            const insensitiveValue = getInsensitiveValue(stat);
            const sensitiveValue = getSensitiveValue(stat);
            const comp = this.compareNumberStat(
                stat.toString(),
                insensitiveValue,
                sensitiveValue,
                typeof isFloat === "function" ? isFloat(stat) : isFloat,
            );
            statValues(stat, insensitiveValue, sensitiveValue);
            comparisons.push(comp);
        }

        const maxLengths = comparisons.reduce(
            (max, comp) => {
                for (let i = 0; i < 4; i++) {
                    max[i] = comp[i].length > max[i] ? comp[i].length : max[i];
                }
                return max;
            },
            [0, 0, 0, 0],
        );

        const comparison = [];
        for (const comp of comparisons) {
            comp[0] = comp[0].padEnd(maxLengths[0]);
            comp[1] = comp[1].padStart(maxLengths[1]);
            comp[2] = comp[2].padEnd(maxLengths[2]);
            comp[3] = comp[3].padEnd(maxLengths[3]);
            comparison.push(`${comp[0]}:   ${comp[1]} vs ${comp[2]}   |   ${comp[3]}`);
        }

        return comparison;
    }
}

function countDefinedIndices(references: readonly IdentifierReference[]): number {
    let numberOfIndices = 0;
    for (const reference of references) {
        if ("indicesCollection" in reference) {
            const graphReference = reference as InGraphIdentifierDefinition;
            numberOfIndices += countIndices(graphReference.indicesCollection);
        }
    }
    return numberOfIndices;
}

function countIndices(collection: ContainerIndicesCollection): number {
    if (!collection) {
        return 0;
    }

    let numberOfIndices = 0;
    for (const indices of collection) {
        for (const index of indices.indices) {
            numberOfIndices++;
            if (isParentContainerIndex(index)) {
                numberOfIndices += this.countIndices(index.subIndices);
            }
        }
    }
    return numberOfIndices;
}
