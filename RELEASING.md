# Publishing releases

One tag publishes one version. The `release.yml` workflow does the rest, in the
order the MCP Registry requires.

1. Bump the version in `package.json`, `server.json` (both the server and the
   npm package entry) and `PACKAGE_VERSION` in `src/server.ts`. The test suite
   fails when these three disagree.
2. Add a `## X.Y.Z - YYYY-MM-DD` section to `CHANGELOG.md`, run
   `npm run catalog` and commit the regenerated `server-card.json`.
3. Merge the reviewed change after CI succeeds.
4. Tag the merged commit `vX.Y.Z` and push the tag.
5. `release.yml` runs the audit, typecheck, build and tests, checks that the tag
   matches `package.json`, then:
   - publishes the package to npm with provenance, through trusted publishing
     (no npm token is stored in the repository);
   - creates the GitHub release with the matching CHANGELOG section as notes;
   - publishes `server.json` to the MCP Registry, authenticated through the
     getmcpads.com DNS key.

Each step skips cleanly when its target already holds the version, so a
partial release can be rerun from the Actions tab with the existing tag.
The npm package needs a trusted publisher on npmjs.com that points at this
repository and `release.yml`.
