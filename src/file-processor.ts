import { logger } from "./logger";
import { promises as fs } from "fs";
import { setConfigFile } from "@eagleoutice/flowr/config";
import { BenchmarkSlicer, BenchmarkSlicerStats } from "@eagleoutice/flowr/benchmark/slicer";
import { DefaultAllVariablesFilter } from "@eagleoutice/flowr/slicing/criterion/filters/all-variables";
import { requestFromInput } from "@eagleoutice/flowr/r-bridge/retriever";
import { EvalStats } from "./model";
import { replacer } from "./utils";
import { SlicerStatsDataflow } from "@eagleoutice/flowr/benchmark/stats/stats";
import { CommandLineOptions } from "command-line-args";

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

        this.compareResults(summaryInsensitive, summarySensitive);
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
        };
        await fs.writeFile(outPath, JSON.stringify(result, replacer));
    }

    private summarizeResult(result: BenchmarkSlicerStats): EvalStats {
        const { stats /*parse, normalize, dataflow*/ } = result;
        const { /*commonMeasurements,*/ perSliceMeasurements, dataflow: dataflowStats } = stats;

        return {
            ...dataflowStats,
            perSliceMeasurements,
        };
    }

    private compareResults(resultInsensitive: EvalStats, resultSensitive: EvalStats) {
        const numberStats: (keyof SlicerStatsDataflow<number>)[] = [
            "numberOfNodes",
            "numberOfEdges",
            "numberOfCalls",
            "numberOfFunctionDefinitions",
            "sizeOfObject",
        ] as const;

        let comparisons = [];
        for (const stat of numberStats) {
            const comp = this.compareNumberStat(
                stat,
                resultInsensitive[stat],
                resultSensitive[stat],
            );
            comparisons.push(comp);
        }

        let maxLengths = comparisons.reduce(
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

        const sliceStats: ("total" | "static slicing" | "reconstruct code")[] = [
            "total",
            "static slicing",
            "reconstruct code",
        ];
        const totalSensitiveStats = {
            total: 0,
            "static slicing": 0,
            "reconstruct code": 0,
        };
        const totalInsensitiveStats = {
            total: 0,
            "static slicing": 0,
            "reconstruct code": 0,
        };
        const insensitiveMeasurements = resultInsensitive.perSliceMeasurements;
        for (const [[criterion], insensitivePerSliceStats] of insensitiveMeasurements.entries()) {
            const sensitivePerSliceStats = resultSensitive.perSliceMeasurements
                .entries()
                .find(([criteria]) => criterion === criteria[0])[1];
            if (!sensitivePerSliceStats) {
                logger.warn(`${this.fileName}: No sensitive stats for ${criterion}`);
                continue;
            }

            comparisons = [];
            for (const stat of sliceStats) {
                const insensitiveValue =
                    parseInt(insensitivePerSliceStats.measurements.get(stat).toString()) / 1000;
                const sensitiveValue =
                    parseInt(sensitivePerSliceStats.measurements.get(stat).toString()) / 1000;
                totalSensitiveStats[stat] += sensitiveValue;
                totalInsensitiveStats[stat] += insensitiveValue;
                const comp = this.compareNumberStat(stat, insensitiveValue, sensitiveValue);
                comparisons.push(comp);
            }

            if (this.parsedOptions.debug) {
                comparison.push(`=== Per slice stats for ${criterion}: ===`);

                maxLengths = comparisons.reduce(
                    (max, comp) => {
                        for (let i = 0; i < 4; i++) {
                            max[i] = comp[i].length > max[i] ? comp[i].length : max[i];
                        }
                        return max;
                    },
                    [0, 0, 0, 0],
                );

                for (const comp of comparisons) {
                    comp[0] = comp[0].padEnd(maxLengths[0]);
                    comp[1] = comp[1].padStart(maxLengths[1]);
                    comp[2] = comp[2].padEnd(maxLengths[2]);
                    comp[3] = comp[3].padEnd(maxLengths[3]);
                    comparison.push(`${comp[0]}:   ${comp[1]} vs ${comp[2]}   |   ${comp[3]}`);
                }
            }
        }

        comparison.push(`=== Total runtime stats (ms): ===`);
        comparisons = [];
        for (const stat of sliceStats) {
            const comp = this.compareNumberStat(
                stat,
                totalInsensitiveStats[stat] / 1000,
                totalSensitiveStats[stat] / 1000,
                true,
            );
            comparisons.push(comp);
        }

        maxLengths = comparisons.reduce(
            (max, comp) => {
                for (let i = 0; i < 4; i++) {
                    max[i] = comp[i].length > max[i] ? comp[i].length : max[i];
                }
                return max;
            },
            [0, 0, 0, 0],
        );

        for (const comp of comparisons) {
            comp[0] = comp[0].padEnd(maxLengths[0]);
            comp[1] = comp[1].padStart(maxLengths[1]);
            comp[2] = comp[2].padEnd(maxLengths[2]);
            comp[3] = comp[3].padEnd(maxLengths[3]);
            comparison.push(`${comp[0]}:   ${comp[1]} vs ${comp[2]}   |   ${comp[3]}`);
        }

        comparison.push(`=== Avg runtime stats (ms): ===`);
        comparisons = [];
        for (const stat of sliceStats) {
            const comp = this.compareNumberStat(
                stat,
                totalInsensitiveStats[stat] / 1000 / insensitiveMeasurements.size,
                totalSensitiveStats[stat] / 1000 / insensitiveMeasurements.size,
                true,
            );
            comparisons.push(comp);
        }

        maxLengths = comparisons.reduce(
            (max, comp) => {
                for (let i = 0; i < 4; i++) {
                    max[i] = comp[i].length > max[i] ? comp[i].length : max[i];
                }
                return max;
            },
            [0, 0, 0, 0],
        );

        for (const comp of comparisons) {
            comp[0] = comp[0].padEnd(maxLengths[0]);
            comp[1] = comp[1].padStart(maxLengths[1]);
            comp[2] = comp[2].padEnd(maxLengths[2]);
            comp[3] = comp[3].padEnd(maxLengths[3]);
            comparison.push(`${comp[0]}:   ${comp[1]} vs ${comp[2]}   |   ${comp[3]}`);
        }

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
}
