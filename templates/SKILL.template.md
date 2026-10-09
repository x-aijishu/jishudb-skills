---
name: <skill-directory-name>
description: >-
  <用中文说明能力、适用场景、交付结果和重要排除项。> /
  <Describe the capability, trigger, concrete output, and important exclusion.>
compatibility: >-
  <List only the host capabilities, services, runtimes, or platforms required.>
metadata:
  author: <maintainer>
  version: "0.1.0"
  openclaw:
    homepage: <canonical-skill-directory-url>
---

# <Skill Display Name>

<In two or three sentences, state the outcome this Skill produces and the
evidence required before claiming success.>

## At a glance

| Item | Details |
| --- | --- |
| Use when | <Primary user intent or symptom> |
| Delivers | <Concrete artifact, decision, diagnosis, or verified state> |
| Requires | <Essential capability, access, input, or authorization> |
| Does not | <Important boundary or neighboring task> |

## Use this skill when

- <Concrete trigger one.>
- <Concrete trigger two.>
- <Concrete trigger three.>

## Do not use this skill when

- <Nearby request>: use `<other-skill>` instead.
- <Unsupported or separately authorized outcome>.

## Agent workflow

### 1. Confirm the target and outcome

1. <Identify the target, desired result, and ambiguity that would materially
   change the workflow.>
2. <Use defaults only for omitted details; preserve the requested count and
   formats. Resolve routine choices without questions and reuse existing consent.>

### 2. Inspect prerequisites and current state

1. <Inspect real tools, configuration, connection, files, or runtime state.>
2. <Classify missing prerequisites without inventing capabilities or facts.>
3. <Separate read-only work from actions requiring explicit authorization.>

### 3. Execute

1. <Perform the smallest sufficient action using actual inputs and supported
   interfaces.>
2. <Preserve IDs, source evidence, and original error details needed for safe
   retry or handoff.>
3. <Check whether existing authorization covers writes or external changes;
   ask only for missing scope. Bound discovery, retries, and correction passes.>

### 4. Verify and hand off

1. <Verify the effective path and inspect the real artifact or target state.>
2. <Report what is proven, what remains unknown, and the exact next action.>

Use these outcome labels when the workflow can end in multiple states:

| State | Meaning |
| --- | --- |
| `COMPLETE` | <All required outputs and verification evidence exist.> |
| `PARTIAL` | <Useful output exists, but name the missing requirement.> |
| `USER_ACTION_REQUIRED` | <A specific approval or user-presence step is pending.> |
| `BLOCKED` | <A required capability or input is unavailable or declined.> |
| `FAILED` | <An attempted operation failed; preserve the cause and recovery step.> |

## Safety and error handling

- <State task-specific safety or privacy invariant.>
- <Map distinct known failure classes to distinct recovery actions.>
- <Bound retries and explain how to reconcile an uncertain write.>

## Resources

- Read [`references/<name>.md`](references/<name>.md) when <condition>.
- Run [`scripts/<name>`](scripts/<name>) when <condition and authorization>.
- Use [`assets/<name>`](assets/<name>) as <intended output/input role>.

Remove this section or any unused line when the Skill has no such resource.

## Discovery

### Keywords

- Chinese: <8–20 focused Chinese task, symptom, product, and error phrases>
- English: <8–20 focused English task, symptom, product, and error phrases>

### Example requests

- “<Natural Chinese request or question>”
- “<Another Chinese symptom or desired output>”
- “<Natural English request or question>”
- “<Another English symptom or desired output>”

### Nearby but different

- “<Confusable request>” → use `<other-skill>` because <reason>.
- “<Unsupported request>” → <state the boundary or required separate action>.
