# Fuzzing

Four targets feed arbitrary bytes to code that reads untrusted input. Each must
refuse bad input and never panic or hang.

| Target            | Reads                     | Why it matters                               |
| ----------------- | ------------------------- | -------------------------------------------- |
| `cli_arguments`   | argv and `--field` values | agents drive the CLI with free text          |
| `backup_archive`  | a backup zip              | a restore opens a file from anywhere         |
| `office_document` | docx, pptx, xlsx          | the search indexer opens every imported file |
| `calendar_feed`   | an iCalendar feed         | it comes from any server the user adds       |

```sh
rustup toolchain install nightly
bun run fuzz:rust -- cli_arguments -- -max_total_time=60
```

The targets reach the app through `fuzz_support` in `src/lib.rs`, which only exists
under `--cfg fuzzing`, so normal builds are untouched.

## Status: does not build yet

`cargo +nightly fuzz build` stops at the link step of `pdf-inspector`:

```
Undefined symbols for architecture arm64: "_rust_fuzzer_test_input"
error: could not compile `pdf-inspector` (lib)
```

`pdf-inspector` lists `crate-type = ["lib", "cdylib"]`, and under sanitizer coverage
cargo links its `cdylib` without the libfuzzer symbols. It is a third party crate,
so the options are a `[patch.crates-io]` copy without the `cdylib` type, or moving
the parsers under test into a small crate with no Tauri or PDF dependencies. Either
makes the targets runnable as they are. Until then this folder is not built by CI.
