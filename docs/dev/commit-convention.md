# Commit convention

BRZ uses [Conventional Commits](https://www.conventionalcommits.org/).

## Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

- **Subject**: imperative mood, under 72 characters, no trailing period.
- **Body**: explains *why*, not *what*. Wrap at 72 characters.
- **Footer**: references the brief number, e.g. `Brief: 10` or `Closes #42`.

## Types

`feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `perf`.

## Scope

The workspace or area touched: `backend`, `frontend`, `deploy`, `ci`, `docs`.

## Examples

- `feat(backend): add sealed bwrap sandbox provider (brief 06)`
- `ci: add typecheck, test, build, secret-scan workflow (brief 10)`
- `docs(dev): document branch strategy and commit convention (brief 10)`

## Forbidden

- `wip`, `fix`, `asdf`, `temp`, `stuff`, or any subject that does not describe the change.
- Subjects over 72 characters.
- Commits that mix unrelated changes. One logical change per commit.