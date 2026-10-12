# Data feasibility milestone

Reviewed: 2026-10-11 (America/Los_Angeles).

**Latest scope update:** The user resumed the fantasy roster application using the completed local dataset. Technical data feasibility and acquisition are complete; do not repeat collection. The private ML scope described below is historical. The original source-use concern remains documented for publication review, while schema and application development can proceed. See `IMPLEMENTATION.md` for the active requirements and checkpoint.

**Current scope update:** The user clarified that the objective is a private dataset for machine-learning practice, with no fantasy application. This supersedes the fantasy-product assumptions below and in `IMPLEMENTATION.md`. The historical report below records the original review, not a blocker for the revised objective.

The [current NBA terms](https://www.nba.com/termsofuse) were rechecked on 2026-10-11. Section 9 permits private noncommercial statistics use with attribution. No explicit machine-learning prohibition was found in the retrieved terms. Treat suitability for a small local educational extraction as a working interpretation, not blanket permission for redistribution, deployment, or other uses. Retain source attribution and notices with local data.

**Current status: local dataset collected and validated.** The 2025–26 regular-season export contains 30 teams, 582 players, 1,230 games, and 26,651 player appearances, from 2025-10-21 to 2026-04-12. Raw samples and full responses are saved locally in the ignored `data/raw/` directory. CSVs and metadata are versioned locally; `data/CURRENT` identifies the successful export. See `README.md` for reproduction, validation details, and limitations.

The source returned five ambiguous home/away matchups, resolved using NBA box scores. A representative box score matched 20 appearances and confirmed seven non-playing entries were absent from the logs. Minutes are rounded whole-minute source values, and position remains unavailable. No Supabase, authentication, roster, lineup, or Vercel implementation is required by the clarified objective.

## Original fantasy application review (superseded)

## Repository inspection

- The starting repository contains only the untracked `IMPLEMENTATION.md` and Git metadata. The specification was read in full and left unchanged.
- No applicable `AGENTS.md` was found in the repository or its ancestor directories. No `.agents` or `.codex` directory exists in this repository.
- No application, database migrations, collector, dependency manifests, or tests exist.
- Local Python is 3.9.6; `nba_api` is not installed. No package installation or credential inspection was performed.

## Source suitability gate

[NBA.com Terms of Use, section 9](https://www.nba.com/termsofuse), reviewed directly, states that statistics “may not be used in connection with any fantasy game”.

The planned product's roster and saved-lineup features create a material suitability concern. Calling this an internship project does not establish permission for its intended deployment. The repository supplies no separate data authorization. Under the specification's explicit suitability-first gate, this is insufficient evidence to proceed with the required source. This is a project acceptance decision, not a determination about enforceability of contractual terms.

Unblocking the current design requires written authorization covering this particular collection, database storage, historical display, fantasy roster/lineup use, and intended deployment. A package software license is not evidence of those data permissions. No extraction was attempted after this gate failed.

## Candidate alternative requiring a scope decision

**SportsDataIO** is a candidate to evaluate, not an approved replacement:

- Its [licensing FAQ](https://sportsdata.io/help/data-rights-and-licensing-questions) describes licenses for database storage and user-facing display within an agreed product scope. Discovery Lab is personal-use only; public-facing products require a commercial license. Pricing is individually quoted.
- Its [historical integration guide](https://sportsdata.io/help/historical-data-integration-guide) describes prior-season team, player, and game feeds, with account-enabled access. Historical coverage can be incomplete; exact 2025–26 coverage remains unverified.
- Its [developer overview](https://sportsdata.io/developers) offers real prior-season data in Discovery Lab and distinguishes scrambled trial data from real data. A trial would not establish statistical accuracy or production suitability.
- Its [NBA data dictionary](https://discoverylab.sportsdata.io/developers/data-dictionary/nba) assigns provider player IDs. Adoption requires an explicit decision about the specification's NBA-provided IDs and `nba_api` requirement; provider identifiers must not be silently treated as NBA identifiers.

For the planned deployment, evaluate a license covering real 2025–26 regular-season game and player statistics, permanent storage/retention, display to authenticated users, and fantasy roster/lineup use. Confirm costs, attribution, historical team relationships, stable IDs, completeness, and season access before choosing this source. No account was created, provider contacted, subscription purchased, or credential requested.

## Technical research completed, without live validation

The official `nba_api` repository documents [LeagueGameLog](https://github.com/swar/nba_api/blob/master/docs/nba_api/stats/endpoints/leaguegamelog.md) with team/player modes and an explicit regular-season parameter. Its [PlayerGameLog implementation](https://github.com/swar/nba_api/blob/master/src/nba_api/stats/endpoints/playergamelog.py) lists game IDs, dates, matchup, minutes, and required counting statistics, with a configurable timeout. These are endpoint candidates only. Documentation does not prove accessible 2025–26 responses, observed formats, completeness, or non-playing-entry semantics.

If the NBA source is authorized, the next probe should collect a small bounded date window using team and player game-log modes, plus a game-level source capable of checking non-playing entries. Join historical team relationships by stable IDs rather than assuming a player's current team. Missing position may remain null. Do not begin a full-season scrape to test a small sample.

## Verification remaining after source approval

1. Pin a compatible Python runtime and collector dependencies, with a lockfile. Record source approval and endpoint/version assumptions.
2. Request a few games and appearances with explicit 2025–26 regular-season filters. Use explicit timeouts, at most three attempts for transient failures, conservative pacing, and bounded backoff. Stop on access denial rather than bypassing it.
3. Save raw responses in an ignored local directory with request parameters and collection timestamps, excluding credentials. Keep generated datasets out of Git.
4. Validate observed fields and ID types. Preserve game ID strings and leading zeroes; reject unexpected numeric game IDs rather than guessing lost formatting. Verify source date/time semantics before converting to PostgreSQL dates.
5. Check minutes against the actual payload: distinguish numeric minutes from clock-formatted durations. Reject unavailable values rather than replacing them with zero. Inspect explicit DNP/inactive indicators and a played appearance with zero recorded minutes; do not infer participation solely from positive minutes.
6. Produce validated sample rows for all four shared tables. Check nonnegative statistics, unique player/game keys, opposing teams, complete foreign-key relationships, and the player's historical team in each game. Verify representative values against an independent source display where permitted.
7. Establish appearance-based directory membership and averages. Record sample counts and exclusions, then verify full-season coverage separately.
8. Following the delivery sequence, implement and verify database staging/atomic publication before a full import. Validate stable-ID upserts, parent-before-child loading, repeat imports, and a failed refresh that preserves the prior successful dataset and metadata.

## Milestone evidence and stopping point

| Check | Result |
| --- | --- |
| Specification and repository inspection | Completed |
| Current source usage suitability | Blocker identified; authorization absent |
| Alternative source research | Candidate documented; license/access/scope not approved |
| Small live extraction and raw samples | Not attempted due to suitability gate |
| Actual dates, IDs, minutes, non-playing semantics | Not verified |
| Historical season availability and completeness | Not verified |
| Normalization, repeatable importer, atomic publication | Not implemented |
| Full import, counts, duplicates, foreign keys, statistics | Not verified |

**Required next decision:** provide suitable authorization for the specified NBA source, or approve evaluating a licensed replacement with its associated source/ID changes and potential cost. Until then, the data feasibility milestone is incomplete and dependent milestones remain paused.
