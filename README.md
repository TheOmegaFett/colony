# Computational Hive (Node Prototype)

A prototype-first Node.js simulation where a colony behaves like a distributed hive mind.

## Features

- Fixed-timestep simulation loop (Node runtime)
- Role-based agents: Queen, Drones, Soldiers, Brood, Threats
- Multi-colony diplomacy (ally/neutral/hostile) with separate hive minds
- Agent lifecycle aging (age + max age per role)
- Queen succession: oldest drone can metamorph into new queen if colony queen dies and food reserves allow it
- Colony food stockpile economy with starvation pressure
- Hive communication layers:
  - Local event signals
  - Spatial pheromone-like trails (food + danger)
  - Shared hive memory with confidence/decay
- Emergent behavior via local perception and role rules
- Right-click interaction on canvas:
  - Drop Food Pellet
  - Drop Threat Agent

## Run

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Controls

- Right-click anywhere in the world to open context menu.
- Choose:
  - `Drop Food Pellet`
  - `Drop Threat Agent`
  - `Deploy Colony ▸`
    - `Competing Colony Queen`
    - `Full Friendly Colony`
    - `Outright Hostile Colony`
- Scroll wheel: zoom in/out.
- Left click + drag: pan around the world.

## Structure

- `src/server/index.js`: HTTP + WebSocket server and tick broadcasting
- `src/sim/Simulation.js`: simulation orchestrator
- `src/sim/world/WorldState.js`: world model
- `src/sim/agents/*`: role-specific logic
- `src/sim/systems/*`: communication, threat/resource/colony systems
- `public/*`: canvas renderer + right-click input
