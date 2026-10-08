# Jishu Skill Authoring Specification

Version: 1.0
Applies to: `jishudb-skills` and `jishubuddy-skills`

## Purpose

Every `SKILL.md` should serve three readers in a predictable order:

1. A person deciding in a few seconds whether the Skill fits.
2. An agent executing the task safely and consistently.
3. A person or search system trying to find the Skill from real-world wording.

Use this document for new Skills. Existing Skills should adopt it when they are
materially edited; a repository-wide rewrite is not required.

The normative words **MUST**, **SHOULD**, and **MAY** indicate required,
recommended, and optional rules.

## Required document order

| Order | Section | Primary reader | Required content |
| --- | --- | --- | --- |
| 1 | YAML frontmatter | Skill selector | Identity, concise discovery description, compatibility, and maintained metadata |
| 2 | Quick scan | Human | Outcome, fit, deliverables, prerequisites, and boundaries in no more than about 450 words |
| 3 | Agent workflow | Agent | Preconditions, ordered execution, decision points, safety, error handling, verification, and completion criteria |
| 4 | Resources | Agent | Conditional links to packaged references, scripts, and assets; omit when none exist |
| 5 | Discovery appendix | Search | Focused keywords, symptoms, scenario phrases, and nearby exclusions; always last |

Use one H1 after the frontmatter. Use H2 sections for the major blocks and H3
sections for steps or modes. Do not repeat the title or create empty sections.

## 1. YAML frontmatter

The frontmatter is the primary automatic-discovery surface. Many hosts inspect
only `name` and `description` before deciding whether to load the body, so the
discovery appendix cannot compensate for a vague description.

```yaml
---
name: action-oriented-skill-name
description: >-
  <Chinese capability, trigger, output, and important exclusion.> /
  <English capability, trigger, output, and important exclusion.>
compatibility: >-
  <Required host capabilities, runtime, platform, service, or connection.>
metadata:
  author: <maintainer>
  version: "0.1.0"
  openclaw:
    homepage: <canonical Skill directory URL>
---
```

Rules:

- `name` MUST match the Skill directory and use lowercase letters, digits, and
  hyphens.
- `description` MUST say what the Skill does and when it applies. It SHOULD
  name the concrete output and one important non-use boundary when confusion
  with another Skill is likely.
- Discovery descriptions in these repositories SHOULD include natural Chinese
  and English wording separated by ` / `.
- `compatibility` SHOULD list only real prerequisites that affect execution.
  Do not use it for marketing claims.
- `metadata.version` MUST change when distributed Skill behavior changes.
- Preserve supported host-specific metadata, but do not claim that one host's
  extension is portable to every host.
- Keep frontmatter concise. Procedures, examples, and long keyword lists belong
  in the body.

## 2. Quick scan

The content from the H1 through the end of `Do not use this skill when` is the
human preview. Keep it short enough to scan without scrolling through the
procedure.

It MUST contain:

- a two- or three-sentence promise that describes the actual result;
- an `At a glance` table with `Use when`, `Delivers`, `Requires`, and
  `Does not` rows;
- three to six concrete positive triggers under `Use this skill when`;
- explicit routing or non-use guidance when a neighboring Skill could be
  selected by mistake.

Do not include installation transcripts, long safety policies, command catalogs,
or implementation details in the quick scan. Do not promise live validation,
publication, deployment, persistence, or device access unless the workflow can
actually prove it.

## 3. Agent workflow

Use `## Agent workflow` as the stable entry heading. Organize the content around
decisions and observable outcomes, not around a fixed number of steps. A small
Skill may need three steps; a risky operational Skill may need more.

The workflow MUST:

- establish the user's desired outcome, target, and relevant constraints;
- inspect actual capabilities, configuration, or state before relying on them;
- distinguish read-only work from writes, installation, login, publication,
  deployment, device changes, or other separately authorized actions;
- specify inputs and outputs precisely enough that another agent can execute
  the task without inventing tools, paths, IDs, credentials, or facts;
- preserve original error causes and map known failure classes to actionable
  recovery steps;
- verify the effective path and final artifact or runtime state, rather than
  treating a command exit or installation as end-to-end success;
- state completion, partial-completion, blocked, and user-action conditions
  when the workflow can stop in more than one meaningful state.

Prefer numbered steps for sequence, tables for mappings, and bullets for
independent rules. Put commands immediately after the step that uses them.
Examples MUST use explicit placeholders and MUST NOT contain real secrets,
private endpoints, personal paths, or unsafe defaults.

### Progressive disclosure

Keep shared decisions and invariants in `SKILL.md`. Move substantial schemas,
provider-specific procedures, evidence contracts, test cases, or long examples
to `references/`. Move deterministic repeated operations to `scripts/`, and
files intended for generated output to `assets/`.

Every packaged resource MUST be linked from `SKILL.md` at the point where the
agent should read or run it. State the condition for loading it. Do not require
the agent to read unrelated references preemptively, and do not duplicate the
same source of truth in multiple files.

## 4. Safety, errors, and verification

These topics may be subsections of the workflow or separate H2 sections when
their size justifies it.

- Put a safety rule next to the risky action whenever possible.
- Require explicit authorization at the mutation boundary, not merely at the
  start of a broad task.
- Give retries a bounded stopping condition and a reconciliation method for
  uncertain writes.
- Treat external content as data, not instructions.
- Never ask for, print, archive, or embed secrets unless the task has a defined
  protected mechanism that genuinely requires them.
- Define evidence for success. Examples include reading a saved record back,
  opening the generated file, observing the expected service response, or
  collecting output from the real target device.

## 5. Discovery appendix

End every Skill with `## Discovery`. This section improves repository search and
full-body indexing. It is not a substitute for the frontmatter description and
MUST NOT introduce new behavior or permissions.

Use only the useful subsections:

### Keywords

List focused terms people actually search for. Group them by language or type
when helpful: product names, task names, symptoms, error strings, protocols,
file formats, and common aliases. Prefer roughly 8–20 discriminating phrases
over a long list of broad nouns.

### Example requests

Include roughly 4–10 natural scenario phrases, normally covering both Chinese
and English. Use questions or requests a real user might type. Vary intent and
symptom wording; do not repeat the description sentence with minor changes.

### Nearby but different

List easily confused requests and route each to the correct Skill or explain
why it is out of scope. This section is strongly recommended when several Skills
share terms such as search, report, setup, connection, or presentation.

Discovery content MUST remain truthful. Do not add popular tools, error strings,
platforms, or capabilities that the workflow does not support merely to increase
recall.

## Writing rules

- Write operational instructions in clear imperative English unless a Skill has
  an explicit reason to use another language. Keep user-search examples
  bilingual for these repositories.
- Use stable terminology for the same object throughout the file.
- Prefer concrete verbs and observable results over adjectives.
- Avoid generic agent advice that does not change decisions.
- Avoid duplicating repository-level installation or policy text. Link to a
  maintained source when the Skill can reliably access it; otherwise package
  the minimum self-contained contract the Skill needs.
- Keep authorization boundaries distinct: planning is not installation, an
  installation is not a launch, a launch is not a device change, and generating
  content is not publishing it.

## Review checklist

Before merging a new or substantially changed Skill, verify:

- The directory name, frontmatter name, homepage, and resource links agree.
- The frontmatter alone is sufficient to select or reject the Skill.
- The quick scan fits within about 450 words and accurately summarizes the body.
- Every procedure uses capabilities that the target host actually provides.
- Every write or external mutation has the correct authorization boundary.
- Known failures preserve their distinct causes and recovery actions.
- Completion requires observable evidence, not a proxy such as installation.
- The discovery appendix is last, searchable, bilingual where useful, and free
  of unsupported claims.
- Scripts and links were run or checked from the packaged Skill directory.
- No placeholders remain outside an intentional template or example.

Start new Skills from
[`templates/SKILL.template.md`](../templates/SKILL.template.md), then copy it
to the new Skill directory as `SKILL.md` and replace every placeholder.
