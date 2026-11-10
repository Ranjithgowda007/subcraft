# Standard Operating Procedure (SOP): `subcraft`

| Document ID | SOP-SUBCRAFT-001 |
| :--- | :--- |
| **Project** | `subcraft` Subtitle Engine |
| **Maintainer** | Ranjith Gowda (<ranjithg0507@gmail.com>) |
| **Repository** | `https://github.com/Ranjithgowda007/subcraft` |
| **Current Version** | `v0.1.0` |
| **Status** | Active / Production Standard |

---

## 1. Purpose & Scope

This Standard Operating Procedure (SOP) defines the engineering, verification, maintenance, and release standards for the `subcraft` open-source npm library. 

Adherence to this SOP ensures that:
1. `subcraft` remains strictly **zero-dependency** and **isomorphic**.
2. All arithmetic, parsing, and serialization functions remain deterministic and mathematically lossless.
3. Package exports conform to modern Node.js and browser ESM/CommonJS specifications.
4. Releases to the public npm registry follow automated quality gates.

---

## 2. Environment & Tooling Prerequisites

Every developer or environment building `subcraft` must meet the following minimum requirements:

| Tool | Minimum Version | Verification Command |
| :--- | :--- | :--- |
| **Node.js** | `>= 20.0.0` (Active LTS) | `node -v` |
| **npm** | `>= 10.0.0` | `npm -v` |
| **Git** | `>= 2.40.0` | `git --version` |
| **TypeScript** | `5.8.x` | `npx tsc -v` |

---

## 3. Local Development Lifecycle

### 3.1 Initial Setup
```bash
# Clone the repository
git clone https://github.com/Ranjithgowda007/subcraft.git
cd subcraft

# Install dependencies (strictly devDependencies; no runtime dependencies allowed)
npm install
```

### 3.2 Available Scripts
* `npm run dev`: Starts `tsup` in watch mode, automatically rebuilding `dist/` on every file change.
* `npm run build`: Executes production build generating ESM (`dist/index.js`), CJS (`dist/index.cjs`), and dual declaration files (`dist/index.d.ts` and `dist/index.d.cts`).
* `npm test`: Runs Vitest test runner across all test suites in a single pass.
* `npm run test:watch`: Runs Vitest in interactive watch mode for Test-Driven Development (TDD).
* `npm run typecheck`: Runs strict TypeScript compiler check (`tsc --noEmit`).
* `npm run check:exports`: Runs `publint` to verify `package.json` export conditions.

### 3.3 Commit Message Standards
All commits must adhere to the **Conventional Commits** specification:
* `feat:` A new feature (e.g., `feat: add WebVTT serializer`).
* `fix:` A bug fix (e.g., `fix: handle edge case in CRLF line normalization`).
* `test:` Adding or updating tests (e.g., `test: add fast-check roundtrip property`).
* `docs:` Documentation changes only (e.g., `docs: update README with grapheme examples`).
* `chore:` Build scripts, package configuration, devDependencies.

---

## 4. Quality Assurance & Testing Standards

### 4.1 Strict Zero-Dependency Policy
Under no circumstances may any package be installed under `"dependencies"` in `package.json`. All utility functions (timecode conversion, text parsing, grapheme counting) must be implemented using native ECMAScript and Web standards (`Intl.Segmenter`, regex, string methods).

### 4.2 Unit & Edge-Case Testing
Every new function or rule must be accompanied by tests in `tests/*.test.ts`:
* Parse tests must include: UTF-8 BOM (`\uFEFF`), CRLF (`\r\n`), missing block indices, multi-line texts, and malformed inputs.
* Timing tests must include: 0ms boundaries, negative inputs, large timecode overflows (10+ hours), and non-integer millisecond rounding.
* Linter tests must include: Real Indic (Kannada) text fixtures, HTML formatting tag fixtures, and boundary limit tests.

### 4.3 Property-Based Testing (`fast-check`)
Whenever mathematical transformations or bidirectional serialization (parse $\leftrightarrow$ stringify) are touched, write an automated property test with `fast-check` to verify that the invariant holds across hundreds of pseudo-random inputs:
```typescript
fc.assert(
  fc.property(arbitraryCues, (cues) => {
    return parseSRT(stringifySRT(cues)).cues.length === cues.length;
  })
);
```

### 4.4 Packaging Verification (`publint`)
Before tagging or publishing any release, execute:
```bash
npm run check:exports
```
This guarantees that `package.json` exports:
* Dual `.d.ts` and `.d.cts` mappings for ESM and CJS consumers.
* No broken paths or missing files in `dist/`.

---

## 5. Release & Publishing Procedure

Follow these steps sequentially to release a new version of `subcraft`:

### Step 1: Pre-Flight Verification Checklist
Run the complete automated quality suite in order:
```bash
# 1. Typecheck
npm run typecheck

# 2. Run all tests
npm test

# 3. Clean production build
npm run build

# 4. Verify exports
npm run check:exports
```
> [!IMPORTANT]
> If any of the above commands fail or emit warnings, halt immediately. Do not publish.

### Step 2: Dry-Run Inspection via `npm pack`
Generate a local tarball without publishing to inspect the exact files being shipped:
```bash
npm pack
```
Verify the output:
* Only `dist/`, `package.json`, `README.md`, and `LICENSE` are included.
* Source files (`src/`), tests (`tests/`), and config files are omitted.
* Remove the `.tgz` file after inspection:
  ```bash
  Remove-Item subcraft-*.tgz
  ```

### Step 3: Version Bumping (SemVer)
Increment the version in `package.json` according to Semantic Versioning:
* `PATCH` (`0.1.0` $\to$ `0.1.1`): Backwards-compatible bug fixes.
* `MINOR` (`0.1.0` $\to$ `0.2.0`): New functionality added in a backwards-compatible manner (e.g. adding WebVTT).
* `MAJOR` (`0.1.0` $\to$ `1.0.0`): Breaking public API changes.

Commit the version bump:
```bash
git add package.json
git commit -m "chore: bump version to vX.Y.Z"
```

### Step 4: NPM Publishing
Ensure you are logged into your npm account with 2-Factor Authentication (2FA) enabled:
```bash
# Login to npm (if not already authenticated)
npm login

# For unscoped package 'subcraft' (or scoped '@ranjithgowda/subcraft'):
npm publish --access public
```

### Step 5: Git Tagging & Pushing
```bash
git tag vX.Y.Z
git push origin main --tags
```

---

## 6. Troubleshooting & Operational Tips

### Issue: Git Remote Push Returns 403 Forbidden
* **Cause:** Windows Git Credential Manager has stored credentials for a different GitHub account (e.g., work account).
* **Resolution:** In Windows, open **Credential Manager $\to$ Windows Credentials**, find `git:https://github.com`, and update it to your personal GitHub credentials, or push using a personal access token (PAT):
  ```bash
  git push https://<TOKEN>@github.com/Ranjithgowda007/subcraft.git main
  ```

### Issue: Node Stream or Polyfill Error in Consumer Web App
* **Cause:** An external dependency was accidentally imported that depends on Node.js built-ins.
* **Resolution:** Ensure `subcraft` has zero external dependencies. Verify with `npm ls` that `node_modules` contains only devDependencies.
