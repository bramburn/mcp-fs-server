# Large-Context Agent Operations (Research-Only)

## Agent Classification
- **Large-Context Agents**: `prd-integrator`, `context-engineer`
- **Context Window**: Optimized for 1M+ tokens
- **Primary Function**: Deep analysis and context generation
- **Strict Constraint**: **NO CODE IMPLEMENTATION**

## Core Principles

### 1. Research-Implementation Boundary (Absolute)
Large-context agents MUST NOT:
- ❌ Write or modify code files
- ❌ Suggest specific code implementations
- ❌ Use `edit`, `write_to_file` for code (only for context.md)
- ❌ Deviate into implementation details

Large-context agents MUST:
- ✅ Analyze entire codebases using semantic search
- ✅ Research best practices and external patterns
- ✅ Generate detailed implementation blueprints
- ✅ Specify exact file paths, methods, and line numbers
- ✅ Create structured context documents

### 2. 6-Step Research Protocol (Mandatory)
Every large-context agent invocation MUST follow these steps in order:
1. **Parse Requirements** - Understand task scope and constraints
2. **Internal Analysis** - Search codebase for patterns and precedents
3. **Memory Check** - Query MCP memory for cached knowledge
4. **External Research** (Conditional) - Only if internal analysis insufficient
5. **Generate Context** - Create structured context.md file
6. **Update Memory & Report** - Store patterns and signal completion

### 3. Context File Structure (Standardized)
All context files MUST follow the template in `.roo/templates/context-template.md` with:
- **Section 2**: Specific file paths, line numbers, and patterns found
- **Section 4**: Step-by-step implementation plan the code agent follows
- **Section 4 Specificity**: Each step must include exact location and action

### 4. Memory Integration (Required)
Before research: `MEMORY_QUERY` for related patterns, previous implementations
After research: `MEMORY_STORE` with keys in format `pattern:{domain}:{aspect}`
Always: `MEMORY_RELATE` to connect new findings to existing knowledge

### 5. Tool Group Enforcement
Large-context agents are **intentionally limited** to:
- `read` - For codebase analysis
- `mcp` - For memory and external tools
- `browser` - For external research

They **DO NOT** have:
- `edit` - Prevents code modification
- `command` - Prevents running build/test commands

This is by design to enforce the research-only mandate.

### 6. Orchestrator Responsibilities
The Orchestrator MUST:
- Always delegate to large-context agent before code agent
- Pass context file path explicitly in delegation message
- Verify context.md exists before delegating to code agent
- Handle token overflow by invoking `summarizer` when needed
- Enforce the 6-step protocol by checking for context file generation

## Workflow Example

**Orchestrator Plan for "Add User Authentication"**:
```yaml
1. ORCHESTRATE_INVOKE_AGENT prd-integrator WITH_TASK "Map PRD auth requirements to codebase"
   PASSING_DATA: [PRD.md, product-requirements]
   EXPECTING_OUTPUT: PRDs/auth/context/task-001-context.md

2. Wait for context file generation

3. ORCHESTRATE_INVOKE_AGENT code WITH_TASK "Implement auth based on context file"
   PASSING_DATA: [PRDs/auth/context/task-001-context.md]
   EXPECTING_OUTPUT: Implementation with passing tests

4. ORCHESTRATE_INVOKE_AGENT debug IF tests fail
```

## Benefits of This Architecture

1. **Cost Optimization**: Large-context model used once for analysis, cheaper model for implementation
2. **Predictability**: Code agents follow blueprints exactly, reducing deviation
3. **Transparency**: Every decision traced to context document
4. **Reusability**: Context files serve as documentation and can be stored in memory
5. **Scalability**: Multiple code agents can work in parallel from different context files
6. **Debugging**: Issues traced to either context quality or implementation accuracy
