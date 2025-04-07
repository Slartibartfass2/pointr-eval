import path from "path";
import fs from "fs";
import { logger } from "./logger";
import { benchmarkOptions } from "@eagleoutice/flowr/cli/common/options";

export type OutputType = "json" | "latex";

export interface Profile {
    name: string;
    benchmarkArgs: string[];
    configs: RunConfig[];
    perFileComparison: boolean;
    output: OutputType[];
    randomSeed: string;
}

export interface RunConfig {
    name: string;
    benchmarkArgs: string[];
}

interface ProfilesConfig {
    profiles: Partial<Profile>[];
}

export function getProfiles(): Profile[] {
    const configPath = path.join(__dirname, "..", "profiles.json");
    try {
        const config = fs.readFileSync(configPath, "utf8");
        const parsedConfig: ProfilesConfig = JSON.parse(config);
        return parsedConfig.profiles.map(readProfile).filter((p) => validateProfile(p));
    } catch (error) {
        logger.error(`Error reading profiles config: ${error}`);
        return [];
    }
}

function readProfile(partialProfile: Partial<Profile>): Profile {
    if (!partialProfile.name) {
        throw new Error("Profile name is required");
    }

    const defaultProfile: Profile = {
        name: partialProfile.name,
        benchmarkArgs: [],
        configs: [
            {
                name: "default",
                benchmarkArgs: [],
            },
        ],
        perFileComparison: false,
        output: ["json"],
        randomSeed: "U2xhcnRpYmFydGZhc3My",
    };

    return {
        ...defaultProfile,
        ...partialProfile,
        configs: partialProfile.configs?.map(readRunConfig) || defaultProfile.configs,
    };
}

function readRunConfig(partialConfig: Partial<RunConfig>): RunConfig {
    if (!partialConfig.name) {
        throw new Error("Run config name is required");
    }

    const defaultConfig: RunConfig = {
        name: partialConfig.name,
        benchmarkArgs: [],
    };

    return {
        ...defaultConfig,
        ...partialConfig,
    };
}

function validateProfile(profile: Profile): boolean {
    const benchmarkArgsKeys = profile.benchmarkArgs.filter(isArgKey);
    for (const arg of benchmarkArgsKeys) {
        if (!hasBenchmarkArg(arg)) {
            logger.error(`Invalid base benchmark argument: ${arg}`);
            return false;
        }
    }
    for (const config of profile.configs) {
        const configArgsKeys = config.benchmarkArgs.filter(isArgKey);
        for (const arg of configArgsKeys) {
            if (!hasBenchmarkArg(arg)) {
                logger.error(`Invalid benchmark argument in config '${config.name}': ${arg}`);
                return false;
            }
        }
    }

    return true;
}

function isArgKey(arg: string): boolean {
    return arg.startsWith("--") || arg.startsWith("-");
}

function getArgName(arg: string): string {
    return arg.startsWith("--") ? arg.slice(2) : arg.slice(1);
}

function hasBenchmarkArg(arg: string): boolean {
    const argName = getArgName(arg);
    return benchmarkOptions.some((option) => option.name === argName || option.alias === argName);
}

export function runForConfigCombinations(
    profile: Profile,
    fn: (configA: RunConfig, configB: RunConfig) => void,
) {
    for (let i = 0; i < profile.configs.length; i++) {
        const configA = profile.configs[i];
        for (let j = i + 1; j < profile.configs.length; j++) {
            const configB = profile.configs[j];
            fn(configA, configB);
        }
    }
}

export function getProfileAsObject(profile: Profile) {
    return {
        name: profile.name,
        benchmarkArgs: getBenchmarkArgsObject(profile),
        randomSeed: profile.randomSeed,
    };
}

function getBenchmarkArgsObject(profile: Profile) {
    const result: { [x: string]: unknown } = { ...getArgsAsObject(profile.benchmarkArgs) };
    for (const config of profile.configs) {
        const configArgs = getArgsAsObject(config.benchmarkArgs);
        result[config.name] = configArgs;
    }
    return result;
}

function getArgsAsObject(args: string[]) {
    const argsObject: Record<string, string> = {};
    for (let i = 0; i < args.length - 1; i++) {
        const arg = args[i];
        if (isArgKey(arg)) {
            const argName = getArgName(arg);
            const nextArg = args[i + 1];
            if (!isArgKey(nextArg)) {
                argsObject[argName] = nextArg;
                i++;
            } else {
                argsObject[argName] = "true";
            }
        }
    }
    return argsObject;
}
