import formatDuration from "format-duration";
import { EvalUltimateSlicerStats } from "../model/flowr-models";
import { PathManager } from "../path-manager";
import { getProfileAsObject, Profile, runForConfigCombinations } from "../profile";
import { TimeManager, TimeMeasurement } from "../time-manager";
import { statsReviver } from "../utils";
import { readJsonFile, writeJsonFile } from "./fs-helper";
import { RepoInfos } from "./repo-info";
import { getSystemInfo } from "./system-info";
import fs from "fs";
import { logger } from "../logger";

export async function generateOutput(
    profile: Profile,
    pathManager: PathManager,
    timeManager: TimeManager,
) {
    // Collect miscellaneous information
    const sysInfo = await getSystemInfo();
    const repoInfos = readJsonFile<RepoInfos>(pathManager.getPath("repo-info"));
    const errorSummaries = readJsonFile(pathManager.getPath("error-summary"));

    // Generate the output
    const output = {};
    if (profile.configs.length > 1) {
        runForConfigCombinations(profile, (configA, configB) => {
            const outputPath = pathManager.getComparisonEvalStatsPath(configA.name, configB.name);
            const stats = readJsonFile<EvalUltimateSlicerStats<string, string>>(
                outputPath,
                statsReviver,
            );
            if (profile.configs.length === 2) {
                // If there are only two configs, we can flatten the output (no 'configA-configB' object)
                for (const [key, value] of Object.entries(stats)) {
                    output[key] = value;
                }
            } else {
                output[`${configA.name}-${configB.name}`] = stats;
            }
        });
    }
    for (const [configName, errors] of Object.entries(errorSummaries)) {
        output[`${configName}Errors`] = errors;
    }
    output["system"] = sysInfo;
    for (const [key, value] of Object.entries(repoInfos)) {
        output[key] = value;
    }
    output["profile"] = getProfileAsObject(profile);
    timeManager.readFromFile();
    output["time"] = formatTimeEntries(timeManager.entriesToObject());

    // Write the output to the output directory
    if (profile.output.includes("json")) {
        writeJsonFile(pathManager.getPath("output"), output);
    }
    if (profile.output.includes("latex")) {
        const latexPath = pathManager.getPath("output").replace(".json", ".tex");
        fs.writeFileSync(latexPath, objectToLaTeX(output));
    }
}

function formatTimeEntries(time: Record<string, TimeMeasurement>) {
    const formattedTime: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(time)) {
        const durationInNs = Number(value.end - value.start);

        formattedTime[key] = {
            durationInNs: durationInNs,
            durationPretty: formatDuration(nsToMs(durationInNs), { ms: true, leading: true }),
        };
    }
    return formattedTime;
}

function nsToMs(value: bigint | number): number {
    if (typeof value === "number") {
        return value / 1_000_000;
    } else {
        return Number(value / 1_000_000n);
    }
}

function objectToLaTeX(obj: unknown): string {
    return flattenObject(obj)
        .map(([key, value]) => {
            const name = key
                .map((k) => formatKey(k, "-"))
                .map(capitalize)
                .join("");
            if (/\d/.test(name)) {
                logger.warn(`Variable name '${name}' contains a number. LaTeX will not compile.`);
            }
            return `\\def\\${name}{${value}}`;
        })
        .join("\n");
}

export function flattenObject(
    object: unknown,
    stopAtObject: (object: unknown) => boolean = () => false,
    previousKeys: string[] = [],
): [string[], unknown][] {
    const lines: [string[], unknown][] = [];
    if (stopAtObject(object)) {
        lines.push([previousKeys, object]);
    } else if (object instanceof Map) {
        for (const [key, val] of object.entries()) {
            lines.push(...flattenObject(val, stopAtObject, [...previousKeys, formatKey(key)]));
        }
    } else if (typeof object === "object") {
        for (const key in object) {
            if (Object.hasOwn(object, key)) {
                lines.push(
                    ...flattenObject(object[key], stopAtObject, [...previousKeys, formatKey(key)]),
                );
            }
        }
    } else {
        lines.push([previousKeys, object]);
    }
    return lines;
}

function formatKey(key: string, sep = " ", upper = false): string {
    const parts = key.split(sep);
    return (
        (upper ? "" : parts[0]) +
        parts
            .slice(upper ? 0 : 1)
            .map(capitalize)
            .join("")
    );
}

export function capitalize(text: string): string {
    return text[0].toUpperCase() + text.slice(1);
}
