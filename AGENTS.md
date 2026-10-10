# Directives for Subagent Orchestration

## Auto-Subagents Activation
For any task requiring:
- Multi-file code changes (>= 3 files) or significant scripts + test suites
- Broad research / multi-source comparisons
- Heavy log/data analysis

### Execution Mandate:
- For read-only research: invoke `research` subagents directly.
- For code modifications and refactoring: the root agent MUST NOT execute 10+ file modifications directly. It MUST call `define_subagent` (with `enable_write_tools: true`) to register `code_developer` / `qa_engineer` and invoke them via `invoke_subagent`.
