# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project aims to follow Semantic Versioning.

## [Unreleased]

### Added
- Multi-colony simulation model with separate hive minds per colony (independent queen, nest, colony state, comm trails/signals/memory).
- Dynamic inter-colony diplomacy states (`ally`, `neutral`, `hostile`) influenced by colony mode, threat pressure, and resource conditions.
- Nested right-click menu options for colony deployment:
  - `Competing Colony Queen`
  - `Full Friendly Colony`
  - `Outright Hostile Colony`
- On-screen color key/legend for entities, zones, and communication trails.
- Agent lifecycle aging (`ageTicks`, per-role `maxAgeTicks`) across queens, drones, soldiers, and threats.
- Queen succession system: oldest drone can metamorph into a queen when a colony queen dies (if resources allow).
- Colony food stockpile economy (`foodStock`) with consumption, conversion to energy, and starvation tracking.
- Larger world/map dimensions (`2400x1600`).
- Camera controls in client:
  - Scroll-wheel zoom (cursor anchored)
  - Left-click drag panning
  - Camera clamping to world bounds
- Full Node test suite using `node:test` with unit and integration coverage across:
  - Protocol/constants
  - World state
  - Perception and hive communication systems
  - Agent lifecycle
  - Colony economy/danger/priority logic
  - Simulation-level colony spawning, diplomacy, and succession behavior
- GitHub Actions CI workflow (`.github/workflows/ci.yml`) running tests on push/PR (Node 20 and 22).
- MIT license file (`LICENSE`).

### Changed
- Simulation tick interval increased from `100ms` to `50ms` (10 TPS -> 20 TPS).
- Drone food delivery now fills colony stockpile instead of directly adding energy.
- Queen brood production now requires both food and energy costs.
- Diplomacy scarcity/abundance logic now considers colony food stock in addition to energy and world food availability.
- Diplomacy balancing now uses local nest proximity + nearby resource pressure, reducing premature hostile flips between competitive colonies.
- Colony economy tuning:
  - Lower baseline food burn
  - Improved food-to-energy conversion
  - Softer starvation penalties
  - Increased drone carry capacity
- Resource spawning now scales more aggressively with colony count and includes emergency forage support near severely starving colonies.
- Lifespan ordering tuned so queens outlive soldiers, and soldiers outlive drones.
- Agent spawn-age variance expanded to reduce synchronized die-off waves over time.
- Food consumption now feeds a colony age-recovery pool that replenishes queen and older worker age (bounded per tick to avoid immortality).
- Lifecycle tuning now uses 20 TPS-aware age ranges (seconds->ticks), with wider per-role variance and safer spawn-age jitter to reduce simultaneous age collapses.
- Queen continuity invariant: colonies now always regenerate a queen (worker succession first, emergency queen fallback when needed).
- Queen survival behavior expanded: self-heals by consuming food reserve, returns to nest if displaced, and reduces risky brood output under low reserves.
- Drone forage/explore coordination updated:
  - Uses colony reserve targets to avoid excessive stockpiling
  - Shares food locations more aggressively
  - Maintains partial specialist scouting so only a subset explores stale/unknown sectors while others service known food routes
- Colony economy now computes survival and sustainable food targets each tick to drive survival-first priorities.
- Emergency colony recovery path added: queen can spawn a bootstrap drone when a colony has no workers, allowing recovery from near-collapse states.
- HUD expanded with colony food stock, starvation, and queen age indicators.
- Snapshot payload expanded for multi-colony and lifecycle fields (colony stockpile/succession, entity ages).
- `package.json` now declares `"license": "MIT"`.
- README header updated with badge pills (CI, Node version, License).

### Fixed
- Server-side WebSocket broadcast readiness check updated to use `WebSocket.OPEN`.
- Queen relocation site evaluation now uses provided communication context reliably.
- Legend/key mismatch fixed by replacing static colony-role swatches with live colony color entries in the UI.

## [0.1.0] - 2026-03-07

### Added
- Initial Node.js computational hive prototype:
  - Fixed-timestep simulation loop
  - Queen, drone, soldier, brood, and threat agents
  - Hive communication via local signals, trail fields, and short-term memory
  - Canvas visualization with HUD
  - Right-click spawning for food and threats
