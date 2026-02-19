# Project File Map: OSRS-Style Co-op PvE

## 🛰️ Server-Side (`/apps/server`)

### Core & Database
| File | Overview | Key Functions / Logic |
| :--- | :--- | :--- |
| `prisma/schema.prisma` | Defines the SQLite database structure and relations. | Database Models & Relations. |
| `index.js` | The main entry point orchestrating Express, Socket.io authentication, and engine initialization. | `io.use`: JWT verification.<br>`getAdjacentWalkable`: Finds valid tiles next to clicked objects.<br>`interact_object`: Authoritative logic validating distance and rewards. |

### Game Logic (`/src/game`)
| File | Overview | Key Functions / Logic |
| :--- | :--- | :--- |
| `pathfinding.js` | Implements A* pathfinding specifically for grid movement with corner-blocking. | `calculatePath`: Computes shortest walkable routes.<br>`getNeighbors`: Prevents clipping through diagonal corners. |
| `cacheManager.js` | Manages the RAM lifecycle for static game data and object definitions. | `loadCacheIntoRAM`: Parses JSON interaction data into memory.<br>`bumpCacheVersion`: Increments metadata to notify clients of updates. |
| `engine.js` | Authoritative server heart managing the 600ms tick loop and day/night cycle. | `startTickEngine`: Emits `tick_update` and `world_time`.<br>`activePlayers`: Map storing current position and pathing for all sockets. |
| `mapManager.js` | Manages physical constraints by merging terrain and object collisions into RAM. | `loadChunksIntoRAM`: Creates unified walkability grid for pathfinder.<br>`saveChunkToDb`: Commits edited terrain to DB and updates RAM cache. |

### Scripts & Generators (`/src/scripts`)
| File | Overview | Key Functions / Logic |
| :--- | :--- | :--- |
| `seedChunks.js` | Generates a 100x100 chunk map with elevation and prop scattering. | `getTileData`: Noise algorithm for height and materials.<br>`Safe Spawn Logic`: Automatically finds walkable grass for new players. |
| `generateTexturesNew.js`| Generates N64-style "grainy" textures using Simplex noise. | `generateRetroTexture`: Creates tiling PNGs for materials.<br>`generateMacroNoise`: Generates the global shader overlay. |

### API Routes (`/src/routes`)
| File | Overview | Key Functions / Logic |
| :--- | :--- | :--- |
| `cache.js` | Central endpoint for asset sync and admin database patching. | `router.get('/full')`: Delivers monolithic game state to client.<br>`router.post('/admin/cache/bump')`: Forces client re-downloads. |
| `auth.js` | Manages registration and secure login via bcrypt and JWT. | `router.post('/register')`: Creates user and character at safe spawn. |
| `spawns.js` | Manages placement and removal of static objects in the world. | `router.post('/')`: Upserts objects at specific coordinates. |
| `map.js` | Handles retrieval and saving of chunk-based terrain data. | `router.post('/save')`: Commits terrain modifications to DB. |

---

## 🎮 Client-Side (`/apps/client`)

### Core Entry
| File | Overview | Key Functions / Logic |
| :--- | :--- | :--- |
| `App.tsx` | Main controller for authentication and game socket initialization. | `handleAuth`: Manages login/register requests.<br>`connectToGame`: Initializes socket with JWT. |
| `main.tsx` | React DOM entry point. | `createRoot`: Renders App within StrictMode. |
| `App.css` | Component-level styles for root layout and animations. | `#root`: Layout constraints.<br>`.logo-spin`: Logo keyframe animation. |
| `index.css` | Global theme, typography, and color variables. | `:root`: Defines dark/light mode color schemes. |

### Networking (`/src/network`)
| File | Overview | Key Functions / Logic |
| :--- | :--- | :--- |
| `useGameEngine.ts` | Hook bridging server ticks with local React state. | `tick_update`: Processes authoritative positions.<br>`world_time`: Updates synced day/night state. |
| `socket.ts` | Singleton manager for the Socket.io connection. | `connectSocket`: Attaches JWT auth headers. |

### Utilities (`/src/utils`)
| File | Overview | Key Functions / Logic |
| :--- | :--- | :--- |
| `assetCache.ts` | Wrapper for IndexedDB persistent browser storage. | `saveGameData`: Manages local storage for world state.<br>`getModelUrl`: Converts Blobs to Object URLs for 3D loaders. |
| `terrainMath.ts` | Bilinear interpolation for smooth character placement. | `getExactHeight`: Snaps player to precise elevation on the grid. |

### UI Components (`/src/components`)
| File | Overview | Key Functions / Logic |
| :--- | :--- | :--- |
| `GameLoader.tsx` | Component for cache sync and model downloading. | `initCache`: Orchestrates version checking.<br>`setProgress`: Tracks model download status. |
| `ContextMenu.tsx` | OSRS-style right-click interaction menu. | `getOptions`: Parses interactable JSON data.<br>`handleAction`: Forwards selections to the world controller. |
| `PlayerHUD.tsx` | Manages stamina drain, run toggles, and game chat. | `toggleRun`: Syncs movement state with server.<br>`Stamina Loop`: Drains/regenerates based on movement. |

### World & Rendering (`/src/components/world`)
| File | Overview | Key Functions / Logic |
| :--- | :--- | :--- |
| `Tile.tsx` | Individual grid squares for real-time terrain editing. | `useEffect`: Directly updates geometry height attributes. |
| `WaterPlane.tsx` | Mesh with custom wave and sparkle shaders. | `WATER_FRAGMENT_SHADER`: Pseudo-random noise animation. |
| `EditorToolbar.tsx` | Control panel for world-building and object spawning. | `tools`: Logic for paint, raise, lower, and smooth tools. |
| `DumbChunk.tsx` | Optimized merged geometry for distant chunks. | `getSharedMaterial`: Injects macro-noise via onBeforeCompile. |
| `GridMap.tsx` | Map renderer that swaps between Tiles and DumbChunks. | `visibleChunks`: Memoized filter based on render distance. |
| `AdminMinimap.tsx` | 2D diagnostic map for chunk management. | `handlePointerUp`: Converts pixels to chunk coordinates. |
| `GameWorld.tsx` | The 3D scene root orchestrating chunks and spawns. | `handleMenuActionSelect`: Handles pathing-then-interacting. |
| `Environment.tsx` | Manages Day/Night lighting and custom "Square Fog". | `squareFogUniforms`: Shader logic for grid-based fog. |
| `CameraManager.tsx` | Orbital camera for play and editor modes. | `useFrame`: Tracks local player mesh frame-by-frame. |

### Entities (`/src/components/entities`)
| File | Overview | Key Functions / Logic |
| :--- | :--- | :--- |
| `ProceduralProps.tsx` | Deterministic N64-style prop geometries (trees, rocks). | `getSeededRandom`: Coordinate-based random variation. |
| `UniversalInstancer.tsx`| GPU instancing manager for high-performance props. | `handleMeshClick`: Maps instance IDs to DB entities. |
| `GameObject.tsx` | Wrapper for non-instanced unique interactive objects. | `renderMesh`: Switch-case based on object definitions. |
| `LocalPlayer.tsx` | Manages the local user's avatar and height interpolation. | `useFrame`: Interpolates visual position toward server targets. |

### Admin Tools (`/src/components/admin`)
| File | Overview | Key Functions / Logic |
| :--- | :--- | :--- |
| `MaterialEditor.tsx` | Defines terrain materials and physics profiles. | `handleSave`: Commits colors/textures to SQLite. |
| `CacheEditor.tsx` | Interface for editing interactive object definitions. | `handleBumpVersion`: Forces global cache synchronization. |