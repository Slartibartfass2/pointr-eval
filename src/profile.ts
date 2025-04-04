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
        configs: [],
        perFileComparison: false,
        output: ["json", "latex"],
        randomSeed: "U2xhcnRpYmFydGZhc3My",
    };

    return {
        ...defaultProfile,
        ...partialProfile,
        configs: partialProfile.configs?.map(readRunConfig) || [],
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

function hasBenchmarkArg(arg: string): boolean {
    const argName = arg.startsWith("--") ? arg.slice(2) : arg.slice(1);
    return benchmarkOptions.some(
        (option) => option.name === argName || option.alias === argName,
    );
}

function 
