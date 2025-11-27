# Context Management & Agent Collaboration Rules

## 1. Context Chaining (Mandatory)
- Outputs become inputs for next agent
- Orchestrator MUST use `new_task` for all delegations
- Include full context, todo items, expected outputs, and next steps
- Reference context file paths explicitly

## 2. Todo Lists as Operational Memory
- Format: `[ ]` pending, `[-]` in-progress, `[x]` completed, `[!]` failed
- Every complex task (>3 steps) must have a todo list
- Update status in real-time
- Each item must be independently executable

## 3. MCP Memory Management
**Before work**: `MEMORY_QUERY` for similar patterns
**During work**: Store patterns as they emerge
**After work**: `MEMORY_RELATE` to connect concepts

**Memory Key Format**: `pattern:{domain}:{aspect}`, `bug:{type}:{description}`, `decision:{area}:{choice}`

## 4. Context File Storage
- Location: `context/tasks/{task-id}-context.md`
- Template: `.roo/templates/context-template.md`
- Must include: codebase analysis, file mappings, step-by-step plan
- Code agent consumes this file exclusively

## 5. Agent Boundaries
| Agent | Can Do | Cannot Do |
|-------|--------|-----------|
| **prd-integrator** | Analyze PRDs, map to codebase, generate context.md | Write code, implement features |
| **context-engineer** | Research patterns, analyze code, generate context.md | Write code, implement features |
| **code** | Implement based on context.md, run tests | Research, question plan, deviate |
| **debug** | Diagnose from logs, add logging, propose fixes | Research requirements |
| **summarizer** | Compress context, optimize tokens | Execute tasks, make decisions |

## 6. Failure Handling
1. Report specific error logs to Orchestrator
2. Update todo status to `[!] failed`
3. Orchestrator decides: retry, rollback, or replan
4. Store failure patterns in memory

## 7. Token Optimization
- Target: Individual agent prompts <3000 tokens
- Auto-summarize when context >2000 tokens
- Use focused todo lists to reduce cognitive load