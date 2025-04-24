import { OptionDefinition } from "command-line-args";

export const SOURCE_PATH_FLAG = "source-path";
export const FLOWR_PATH_FLAG = "flowr-path";

export const mainOptions: OptionDefinition[] = [
    { name: "name", defaultOption: true, type: String },
    { name: "verbose", alias: "v", type: Boolean },
    { name: "debug", alias: "d", type: Boolean },
    { name: "profile", alias: "p", type: String },
    { name: "output-path", alias: "o", type: String, defaultValue: "./results" },
    { name: "force", type: Boolean },
];

export const discoverOptions: OptionDefinition[] = [
    { name: SOURCE_PATH_FLAG, alias: "i", type: String },
];

export const benchmarkOptions: OptionDefinition[] = [
    { name: FLOWR_PATH_FLAG, alias: "f", type: String },
    { name: "limit", alias: "l", type: String },
];
export const summarizerOptions: OptionDefinition[] = [
    { name: FLOWR_PATH_FLAG, alias: "f", type: String },
];

export const comparisonOptions: OptionDefinition[] = [
    { name: "generate-output", alias: "g", type: Boolean, defaultValue: true },
];

export const fullOptions: OptionDefinition[] = [
    { name: SOURCE_PATH_FLAG, alias: "i", type: String },
    { name: FLOWR_PATH_FLAG, alias: "f", type: String },
    { name: "skip-discover", alias: "s", type: Boolean, defaultValue: false },
    { name: "limit", alias: "l", type: String },
];
