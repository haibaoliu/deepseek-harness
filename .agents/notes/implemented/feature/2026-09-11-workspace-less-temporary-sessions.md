# Agent Note: Workspace-less temporary sessions get their own scratch directory

Status: implemented

English | [中文](2026-09-11-workspace-less-temporary-sessions.zh.md)

## Problem

Two unrelated gaps shared one entry point. The sidebar's un-scoped New Session action resolved
the current or most recent Workspace before creating a session, so a user who wanted a quick
throwaway chat silently inherited that Workspace and its file scope. A session created with
neither a Workspace nor an explicit `cwd` then fell back to the deployment's shared default
directory (`process.cwd()`), so a temporary chat's file outputs landed beside the harness
default directory and could collide with another session's scratch work. Separately, a session
that existed but had no Workspace rendered its composer read-only and opened the Workspace
picker when clicked, so the one session kind that most needs free-form input could not be typed
into.

## Decision

The un-scoped New Session action no longer resolves or connects a Workspace. It opens a
**workspace-less temporary session**: it reuses an existing blank ungrouped session when one is
available, so repeated clicks do not accumulate empty rows, and otherwise asks the host to
create one. Workspace-scoped New Session actions (the rows inside a Workspace browser) keep
connecting their Workspace, because there the Workspace is the user's explicit choice.

An existing session is never gated on a Workspace picker: only the no-session state stays inert.
A raised composer block still disables input for a workspace-less session, but the model seat
stays live so the block can be cleared from the composer.

The host gains an optional `temporarySessionRoot` deployment setting, defaulted to
`dshHomePath('tmp-sessions')`. A session creation that names neither a Workspace nor a `cwd`
receives `join(temporarySessionRoot, randomUUID())` instead of the shared default, so each
temporary session owns a fresh directory that no other session writes into. When the setting is
absent — an explicit `undefined`, as hermetic unit tests pass — creation keeps the legacy shared
fallback rather than writing into the real `$DSH_HOME`.

## Alternatives considered

**Keep resolving the most recent Workspace for the un-scoped action.** The action is the one
entry point that does not name a Workspace, so inferring one from history contradicts what the
user asked for; a temporary chat that inherits a Workspace is also the case the isolation
setting exists to avoid.

**Give every temporary session the shared default `cwd` and rely on ignore rules.** The default
directory is the deployment's, not the session's, so no session-scoped cleanup can distinguish
one temporary chat's outputs from another's. A per-session directory makes the boundary
structural instead of conventional.

**Always synthesize a scratch directory, ignoring the configured fallback.** Deployments that
want a fixed project directory for unnamed sessions would lose that control, and test harnesses
would start writing into the real `$DSH_HOME`. The setting stays optional and explicit
`undefined` preserves the old behavior.

## Consequences

A temporary chat now behaves like a scratch space: its `cwd` is unique per session, so file
outputs cannot leak into the harness default directory or into another session's scratch space,
and the sidebar's quick New Session no longer needs a Workspace decision. Workspace-scoped
creation is unchanged. Because the scratch root lives under `$DSH_HOME`, temporary sessions
survive a harness restart but are never automatically deleted; deployments that want them
cleaned up own that policy. Existing sessions that were created before the setting existed keep
their recorded `cwd`, so the change is forward-only.
