# pointr-eval

Evaluation of the flowr pointer analysis.

## Commands

- `discover`: Recursively searches for all R files in the expected location of the ssoc-data repo.

```bash
npm run discover -- -i <path-to-ssoc-data-repo> -o <path-to-output>.json
```

- `benchmark`: Runs the flowr benchmark command on all passed R files with and without the pointer analysis.

```bash
npm run benchmark -- -i <path-to-discovered-files>.json -f <path-to-flowr-repo> -o <path-to-results-directory>
```

- `summarizer`: Summarizes the benchmark results.

```bash
npm run summarizer -- -i <path-to-results-directory> -f <path-to-flowr-repo>
```

- `comparison`: Compares the pointer analysis results.

```bash
npm run comparison -- -i <path-to-results-directory> -o <path-to-output-directory>
```

- `full`: Runs the discover, benchmark, summarizer, and eval commands in sequence.

```bash
npm run full -- -i <path-to-ssoc-data-repo> -f <path-to-flowr-repo> -o <path-to-results-directory>
```

or with a pre-discovered file list:

```bash
npm run full -- --skip-discover --files-path <path-to-discovered-files>.json -f <path-to-flowr-repo> -o <path-to-results-directory>
```
