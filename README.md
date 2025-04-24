# pointr-eval

Evaluation of flowr with a selected profile.

## Commands

This repository contains several commands to evaluate the flowr tool with a selected profile.
The commands can be run separately or in sequence using the `full` command.

### Standard Arguments

The following arguments can be passed to all commands:

- `-p` or `--profile`: Specifies the profile to use. See [profiles.json](./profiles.json) for available profiles. (required)
- `-v` or `--verbose`: Enables verbose output.
- `-d` or `--debug`: Enables debug output.
- `-o` or `--output-path`: Specifies the output directory for the results. If not provided, the default is `./results`.
- `--force`: Forces the command to run even if the output directory already exists. Use with caution as it will overwrite existing files.

### Discover

Recursively searches for all R files in the passed location.

Options:

- `-i` or `--source-path`: Specifies the input path to search for R files. (required)

Example:

```bash
npm run discover -- -p default -i <path-to-source-repo>
```

### Benchmark

Runs the flowr benchmark command on all discovered R files for each configuration of the selected profile.

Options:

- `-f` or `--flowr-path`: Specifies the path to the flowr repository. (required)
- `-l` or `--limit`: Limits the number of files to benchmark. Useful for testing purposes.

Example:

```bash
npm run benchmark -- -p default -f <path-to-flowr-repo>
```

### Summarizer

Summarizes the benchmark results for each configuration of the selected profile.

Options:

- `-f` or `--flowr-path`: Specifies the path to the flowr repository. (required)

Example:

```bash
npm run summarizer -- -p default -f <path-to-flowr-repo>
```

### Comparison

Compares the results of the summarizer step.

Example:

```bash
npm run comparison -- -p default
```

### Full

Runs all commands in sequence: discover, benchmark, summarizer, and comparison.

Options:

- `-i` or `--source-path`: Specifies the input path to search for R files. (required)
- `-f` or `--flowr-path`: Specifies the path to the flowr repository. (required)
- `-l` or `--limit`: Limits the number of files to benchmark. Useful for testing purposes.
- `-s` or `--skip-discover`: Skips the discover step. Useful if the files have already been discovered.
  Expects the already discovered files at the output path.

Example:

```bash
npm run full -- -p default -i <path-to-source-repo> -f <path-to-flowr-repo>
```
