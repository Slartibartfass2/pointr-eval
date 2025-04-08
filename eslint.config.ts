import prettier from "eslint-config-prettier";
import js from "@eslint/js";
import ts from "typescript-eslint";
import tsdoc from "eslint-plugin-tsdoc";

export default ts.config(
    js.configs.recommended,
    ...ts.configs.recommended,
    prettier,
    {
        files: ["**/*.ts"],
        plugins: {
            tsdoc,
        },
        rules: {
            "tsdoc/syntax": "warn",
        },
    },
    {
        ignores: ["node_modules/", "dist/", "results/", "results-*/", ".venv/"],
    },
);
