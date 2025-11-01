import Phaser from 'phaser';
import { Character } from '../gameobjects/Character';
import { npcConfigs } from '../config/npcConfigs';
import type { DialogueAgent, DialogueStreamChunk } from '../dialogue/BaseDialogueAgent';
import { DebugEventPanel } from '../ui/DebugEventPanel';

type Direction = 'up' | 'down' | 'left' | 'right';

type NpcMoveTarget =
    | {
          kind: 'point';
          position: Phaser.Math.Vector2;
          stopDistance: number;
          path: Phaser.Math.Vector2[];
          pathIndex: number;
          nextPathRefresh: number;
          onArrive?: () => void;
      }
    | {
          kind: 'player';
          stopDistance: number;
          path: Phaser.Math.Vector2[];
          pathIndex: number;
          lastPlayerTile: Phaser.Math.Vector2;
          nextPathRefresh: number;
          onArrive?: () => void;
      };

interface NpcConversationState {
    participants: [Character, Character];
    cancelled: boolean;
}

const range = (start: number, end: number) =>
    Array.from({ length: end - start + 1 }, (_, i) => start + i);

const PLAYER_FRAMES = {
    walk: {
        down: range(131, 135),
        left: range(124, 129),
        right: range(112, 117),
        up: range(118, 123),
    },
    idle: {
        down: range(74, 79),
        right: range(56, 61),
        left: range(68, 73),
        up: range(62, 67),
    },
    sit: {
        down: null,
        right: null,
        left: null,
        up: null,
    },
};

export class MainScene extends Phaser.Scene {
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

    private player!: Character;
    private npcs: Character[] = [];
    private activeNpc: Character | null = null;
    private activeAgent?: DialogueAgent;

    private interactKey!: Phaser.Input.Keyboard.Key;
    private cancelKey!: Phaser.Input.Keyboard.Key;
    private interactionPrompt!: Phaser.GameObjects.Text;
    private npcDialogue!: Phaser.GameObjects.Text;
    private npcReasoningText!: Phaser.GameObjects.Text;
    private playerInputText!: Phaser.GameObjects.Text;
    private isInteracting = false;
    private isAwaitingInput = false;
    private isWaitingForResponse = false;
    private playerInput = '';
    private threadMessages: Array<{ speaker: 'npc' | 'player'; text: string; prefix?: string }> =
        [];
    private inputPrefix = 'You: ';
    private npcDisplayName = 'NPC';
    private currentReasoningText = '';
    private activeConversationId = 0;
    private readonly debugPanel = DebugEventPanel.getInstance();
    private detachDebugListener?: () => void;
    private readonly playerConversationId = 'player:main';
    private readonly npcSpeechBubbles = new Map<Character, Phaser.GameObjects.Text>();
    private readonly npcSpeechBubbleTimers = new Map<Character, number>();
    private readonly npcConversationStates = new Map<
        string,
        { state: NpcConversationState; promise: Promise<void> }
    >();
    private readonly npcConversationParticipants = new Map<Character, string>();
    private readonly npcConversationCooldowns = new Map<string, number>();
    private readonly npcConversationRadius = 140;
    private readonly npcConversationCooldownMs = 45000;
    private facing: Direction = 'down';

    private npcMoveTargets = new Map<Character, NpcMoveTarget>();
    private anchorMarker!: Phaser.GameObjects.Rectangle;

    private navGrid: boolean[][] = [];
    private mapTileWidth = 48;
    private mapTileHeight = 48;
    private mapWidthInTiles = 0;
    private mapHeightInTiles = 0;

    constructor() {
        super({ key: 'MainScene' });
    }

    create(): void {
        const data = this.cache.json.get('data') as { layers?: string[] } | undefined;
        const layers = data?.layers ?? [];

        this.debugPanel.setActiveNpc(null);

        layers.forEach((layer: string, i: number) => {
            if (this.textures.exists(layer)) {
                this.add
                    .image(0, 0, layer)
                    .setOrigin(0, 0)
                    .setDepth(10 * i);
            }
        });

        const map = {
            widthInPixels: 3408,
            heightInPixels: 1344,
            mapTile: 48,
        };
        this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
        this.mapTileWidth = map.mapTile;
        this.mapTileHeight = map.mapTile;
        this.mapWidthInTiles = map.widthInPixels / map.mapTile;
        this.mapHeightInTiles = map.heightInPixels / map.mapTile;

        const csv = this.cache.text.get('lvl1_collisions').trim().split('\n');
        const cell = map.mapTile; // your LDtk grid size

        const staticBodies = this.physics.add.staticGroup();
        csv.forEach((row: string, j: number) => {
            row.split(',').forEach((v, i) => {
                if (v !== '0') {
                    // non-zero means “occupied” (value/color mapped in LDtk)
                    const r = this.add.rectangle(
                        i * cell + cell / 2,
                        j * cell + cell / 2,
                        cell,
                        cell,
                    );
                    this.physics.add.existing(r, true); // static body
                    staticBodies.add(r);
                }
            });
        });

        this.buildNavigationGrid(staticBodies);

        this.player = new Character({
            scene: this,
            texture: 'steve',
            position: { x: 952, y: 156 },
            colliders: staticBodies,
            speed: 200,
            frameConfig: PLAYER_FRAMES,
        });
        this.player.sprite.setDepth(400);

        this.npcs = npcConfigs.map((config) => {
            const speed = config.speed ?? 0;
            const npc = new Character({
                scene: this,
                npc: true,
                texture: config.texture,
                position: config.position,
                colliders: staticBodies,
                frameConfig: PLAYER_FRAMES,
                speed,
                dialogueAgent: config.dialogueAgent,
                initialDirection: config.initialDirection ?? 'down',
            });
            this.physics.add.collider(this.player.sprite, npc.sprite);

            const agent = npc.getDialogueAgent();
            if (agent) {
                this.debugPanel.registerNpc(agent.getDisplayName());
            }

            return npc;
        });

        const firstAgent = this.npcs[0]?.getDialogueAgent();
        if (firstAgent) {
            this.npcDisplayName = firstAgent.getDisplayName();
        }

        for (let i = 0; i < this.npcs.length; i += 1) {
            const npcA = this.npcs[i];

            for (let j = i + 1; j < this.npcs.length; j += 1) {
                const npcB = this.npcs[j];
                this.physics.add.collider(npcA.sprite, npcB.sprite);
            }
        }

        const keyboard = this.input.keyboard;

        if (!keyboard) {
            throw new Error('Keyboard input plugin is not available.');
        }

        this.cursors = keyboard.createCursorKeys();
        this.interactKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        this.cancelKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

        this.interactionPrompt = this.add
            .text(this.player.sprite.x, this.player.sprite.y - 60, 'Press SPACE to chat', {
                fontFamily: 'monospace',
                fontSize: '16px',
                color: '#ffffff',
                backgroundColor: 'rgba(0, 0, 0, 0.75)',
                padding: { left: 6, right: 6, top: 2, bottom: 2 },
            })
            .setOrigin(0.5)
            .setDepth(1000)
            .setVisible(false);

        this.npcDialogue = this.add
            .text(24, this.cameras.main.height - 96, '', {
                fontFamily: 'monospace',
                fontSize: '18px',
                color: '#ffffff',
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                wordWrap: { width: this.cameras.main.width - 48 },
                padding: { left: 8, right: 8, top: 6, bottom: 6 },
            })
            .setScrollFactor(0)
            .setDepth(1000)
            .setOrigin(0, 1)
            .setVisible(false);

        this.npcReasoningText = this.add
            .text(24, this.cameras.main.height - 120, '', {
                fontFamily: 'monospace',
                fontSize: '16px',
                fontStyle: 'italic',
                color: '#9aa5ff',
                backgroundColor: 'rgba(20, 20, 50, 0.55)',
                wordWrap: { width: this.cameras.main.width - 48 },
                padding: { left: 8, right: 8, top: 4, bottom: 4 },
            })
            .setScrollFactor(0)
            .setDepth(1000)
            .setOrigin(0, 1)
            .setVisible(false);

        this.playerInputText = this.add
            .text(24, this.cameras.main.height - 48, '', {
                fontFamily: 'monospace',
                fontSize: '18px',
                color: '#00ff9d',
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                wordWrap: { width: this.cameras.main.width - 48 },
                padding: { left: 8, right: 8, top: 6, bottom: 6 },
            })
            .setScrollFactor(0)
            .setDepth(1000)
            .setOrigin(0, 1)
            .setVisible(false);

        this.input.keyboard?.on('keydown', this.handleTyping, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.input.keyboard?.off('keydown', this.handleTyping, this);
        });

        const camera = this.cameras.main;
        camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
        camera.startFollow(this.player.sprite, true, 0.15, 0.15);

        const zoomX = camera.width / map.widthInPixels;
        const zoomY = camera.height / map.heightInPixels;
        const calculatedZoom = Math.min(zoomX, zoomY);
        const zoom = calculatedZoom >= 1 ? Math.floor(calculatedZoom) : 1;

        camera.setZoom(zoom);
    }

    update(): void {
        if (!this.player || !this.cursors) {
            return;
        }

        const velocity = new Phaser.Math.Vector2(0, 0);

        const playerSprite = this.player.sprite;
        let nearestNpc: Character | null = null;
        let nearestDistance = Number.POSITIVE_INFINITY;

        this.npcs.forEach((npc) => {
            if (!npc.getDialogueAgent()) {
                return;
            }

            const dist = Phaser.Math.Distance.Between(
                playerSprite.x,
                playerSprite.y,
                npc.sprite.x,
                npc.sprite.y,
            );

            if (dist < nearestDistance) {
                nearestDistance = dist;
                nearestNpc = npc;
            }
        });

        const interactionRadius = 90;
        const activeNpc = this.activeNpc;
        const activeDistance = activeNpc
            ? Phaser.Math.Distance.Between(
                  playerSprite.x,
                  playerSprite.y,
                  activeNpc.sprite.x,
                  activeNpc.sprite.y,
              )
            : Infinity;

        const isCloseToNearest = nearestDistance <= interactionRadius;
        const isCloseToActive = this.isInteracting && activeDistance <= interactionRadius;
        const promptNpc = activeNpc ?? nearestNpc;
        const isCloseToNpc = this.isInteracting ? isCloseToActive : isCloseToNearest;

        const promptText = (() => {
            if (!promptNpc || !isCloseToNpc) {
                return 'Press SPACE to chat';
            }

            if (!this.isInteracting) {
                return 'Press SPACE to chat';
            }

            if (this.isAwaitingInput) {
                return 'Press ENTER to send';
            }

            if (this.isWaitingForResponse) {
                return `${this.npcDisplayName} is thinking...`;
            }

            return '';
        })();

        if (promptNpc) {
            this.interactionPrompt
                .setVisible(this.isInteracting || isCloseToNpc)
                .setPosition(promptNpc.sprite.x, promptNpc.sprite.y - 60)
                .setText(promptText);
        } else {
            this.interactionPrompt.setVisible(false);
        }

        if (this.isInteracting && !isCloseToActive) {
            this.cancelConversation(true);
        } else if (!this.isInteracting && !isCloseToNearest) {
            if (
                this.threadMessages.length > 0 ||
                this.npcDialogue.visible ||
                this.playerInputText.visible
            ) {
                this.threadMessages = [];
                this.npcDialogue.setVisible(false);
                this.playerInputText.setVisible(false);
                this.refreshThreadDisplay();
            }
        }

        if (
            Phaser.Input.Keyboard.JustDown(this.cancelKey) &&
            (this.isInteracting || this.isWaitingForResponse)
        ) {
            this.cancelConversation(true);
        }

        if (nearestNpc && isCloseToNpc && Phaser.Input.Keyboard.JustDown(this.interactKey)) {
            if (!this.isInteracting) {
                this.startConversation(nearestNpc);
            }
        }

        if (this.cursors.left?.isDown) {
            velocity.x -= 1;
        } else if (this.cursors.right?.isDown) {
            velocity.x += 1;
        }

        if (this.cursors.up?.isDown) {
            velocity.y -= 1;
        } else if (this.cursors.down?.isDown) {
            velocity.y += 1;
        }

        this.player.move(velocity);
        this.updateNpcMovement();
        this.updateNpcSpeechBubbles();
        this.expireNpcSpeechBubbles();
        this.updateNpcConversations();
    }

    private startConversation(npc: Character): void {
        const agent = npc.getDialogueAgent();

        if (!agent) {
            return;
        }

        this.stopNpcConversationForNpc(npc);

        this.activeConversationId += 1;
        this.isInteracting = true;
        this.activeNpc = npc;
        this.clearNpcTarget(npc);
        this.activeAgent = agent;
        this.isAwaitingInput = false;
        this.isWaitingForResponse = false;
        this.playerInput = '';
        this.threadMessages = [];
        this.updateNpcReasoningDisplay(null);
        this.inputPrefix = agent.getInputPrefix();
        this.attachDebugListener(agent);

        npc.faceTowards(this.player.sprite);
        npc.idle();
        this.player.faceTowards(npc.sprite);
        this.player.idle();

        this.npcDisplayName = agent.getDisplayName();
        this.debugPanel.setActiveNpc(this.npcDisplayName);

        const partnerId = this.playerConversationId;
        let items = agent.getItems(partnerId);

        if (items.length === 0) {
            const initialMessage =
                agent.getInitialMessage() || 'Hey there! What are you working on today?';

            if (initialMessage) {
                agent.recordMessage(partnerId, 'assistant', initialMessage);
            }

            items = agent.getItems(partnerId);
        }

        items.slice(-2).forEach((item) => {
            const speaker = item.role === 'assistant' ? 'npc' : 'player';
            const prefix = speaker === 'npc' ? this.npcDisplayName : this.inputPrefix;
            this.appendThreadMessage(speaker, item.content, prefix);
        });

        this.prepareForPlayerInput();
    }

    private endConversation(clearThread: boolean): void {
        this.detachDebugListenerIfNeeded();
        this.isInteracting = false;
        this.isAwaitingInput = false;
        this.isWaitingForResponse = false;
        this.playerInput = '';
        this.inputPrefix = 'You: ';
        this.updateNpcReasoningDisplay(null);
        this.debugPanel.setActiveNpc(null);
        if (clearThread) {
            this.threadMessages = [];
            this.refreshThreadDisplay();
            this.npcDialogue.setVisible(false);
            this.playerInputText.setVisible(false);
            return;
        }

        this.refreshThreadDisplay();
    }

    private cancelConversation(clearThread: boolean): void {
        this.activeConversationId += 1;
        this.endConversation(clearThread);
        this.activeNpc = null;
        this.activeAgent = undefined;
        this.npcDisplayName = 'NPC';
        this.interactionPrompt.setVisible(false);
    }

    private buildNavigationGrid(objects: Phaser.Physics.Arcade.StaticGroup): void {
        const width = this.mapWidthInTiles;
        const height = this.mapHeightInTiles;

        this.navGrid = Array.from({ length: height }, () => Array(width).fill(true));

        const tileWidth = this.mapTileWidth;
        const tileHeight = this.mapTileHeight;

        objects.children.entries.forEach((obj) => {
            const { x: rawX, y: rawY } = obj.body?.position ?? { x: 0, y: 0 };
            const rawWidth = 48;
            const rawHeight = 48;

            if (rawWidth <= 0 || rawHeight <= 0) {
                return;
            }

            const rect = new Phaser.Geom.Rectangle(rawX, rawY, rawWidth, rawHeight);

            const startX = Phaser.Math.Clamp(Math.floor(rect.left / tileWidth), 0, width - 1);
            const endX = Phaser.Math.Clamp(Math.floor((rect.right - 1) / tileWidth), 0, width - 1);
            const startY = Phaser.Math.Clamp(Math.floor(rect.top / tileHeight), 0, height - 1);
            const endY = Phaser.Math.Clamp(
                Math.floor((rect.bottom - 1) / tileHeight),
                0,
                height - 1,
            );

            for (let ty = startY; ty <= endY; ty += 1) {
                const row = this.navGrid[ty];

                if (!row) {
                    continue;
                }

                for (let tx = startX; tx <= endX; tx += 1) {
                    row[tx] = false;
                }
            }
        });

        // Seal outer walls of the map to keep NPCs inside the scene bounds.
        for (let x = 0; x < width; x += 1) {
            this.navGrid[0][x] = false;
            this.navGrid[height - 1][x] = false;
        }

        for (let y = 0; y < height; y += 1) {
            this.navGrid[y][0] = false;
            this.navGrid[y][width - 1] = false;
        }
    }

    private appendThreadMessage(
        speaker: 'npc' | 'player',
        text: string,
        prefix?: string,
        options?: { skipTrim?: boolean },
    ): void {
        const cleaned = options?.skipTrim ? text : text.trim();

        if (!cleaned) {
            return;
        }

        this.threadMessages.push({ speaker, text: cleaned, prefix });

        if (this.threadMessages.length > 2) {
            this.threadMessages.splice(0, this.threadMessages.length - 2);
        }

        this.refreshThreadDisplay();
    }

    private isWalkableTile(tileX: number, tileY: number): boolean {
        if (
            tileX < 0 ||
            tileY < 0 ||
            tileX >= this.mapWidthInTiles ||
            tileY >= this.mapHeightInTiles
        ) {
            return false;
        }

        return this.navGrid[tileY]?.[tileX] ?? false;
    }

    private worldToTile(position: Phaser.Types.Math.Vector2Like): Phaser.Math.Vector2 {
        return new Phaser.Math.Vector2(
            Math.floor(position.x / this.mapTileWidth),
            Math.floor(position.y / this.mapTileHeight),
        );
    }

    private tileToWorld(tileX: number, tileY: number): Phaser.Math.Vector2 {
        return new Phaser.Math.Vector2(
            tileX * this.mapTileWidth + this.mapTileWidth / 2,
            tileY * this.mapTileHeight + this.mapTileHeight / 2,
        );
    }

    private findClosestWalkableTile(tile: Phaser.Math.Vector2): Phaser.Math.Vector2 | null {
        if (this.isWalkableTile(tile.x, tile.y)) {
            return tile.clone();
        }

        const maxRadius = 6;

        for (let radius = 1; radius <= maxRadius; radius += 1) {
            for (let dx = -radius; dx <= radius; dx += 1) {
                for (let dy = -radius; dy <= radius; dy += 1) {
                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) {
                        continue;
                    }

                    const candidateX = tile.x + dx;
                    const candidateY = tile.y + dy;

                    if (this.isWalkableTile(candidateX, candidateY)) {
                        return new Phaser.Math.Vector2(candidateX, candidateY);
                    }
                }
            }
        }

        return null;
    }

    private computePath(
        startWorld: Phaser.Math.Vector2,
        goalWorld: Phaser.Math.Vector2,
    ): Phaser.Math.Vector2[] | null {
        const startTile = this.worldToTile(startWorld);
        const goalTile = this.worldToTile(goalWorld);

        if (!this.isWalkableTile(startTile.x, startTile.y)) {
            const adjustedStart = this.findClosestWalkableTile(startTile);

            if (!adjustedStart) {
                return null;
            }

            startTile.copy(adjustedStart);
        }

        if (!this.isWalkableTile(goalTile.x, goalTile.y)) {
            const adjustedGoal = this.findClosestWalkableTile(goalTile);

            if (!adjustedGoal) {
                return null;
            }

            goalTile.copy(adjustedGoal);
        }

        if (startTile.equals(goalTile)) {
            return [this.tileToWorld(goalTile.x, goalTile.y)];
        }

        interface Node {
            x: number;
            y: number;
            f: number;
        }

        const width = this.mapWidthInTiles;
        const height = this.mapHeightInTiles;

        const gScores = Array.from({ length: height }, () =>
            Array(width).fill(Number.POSITIVE_INFINITY),
        );
        const fScores = Array.from({ length: height }, () =>
            Array(width).fill(Number.POSITIVE_INFINITY),
        );
        const cameFrom = new Map<string, { x: number; y: number }>();

        const startKey = `${startTile.x},${startTile.y}`;
        gScores[startTile.y][startTile.x] = 0;
        fScores[startTile.y][startTile.x] =
            Math.abs(goalTile.x - startTile.x) + Math.abs(goalTile.y - startTile.y);

        const openSet: Node[] = [
            {
                x: startTile.x,
                y: startTile.y,
                f: fScores[startTile.y][startTile.x],
            },
        ];

        const neighborOffsets = [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 },
        ];

        const popLowest = (): Node | undefined => {
            if (openSet.length === 0) {
                return undefined;
            }

            let lowestIndex = 0;

            for (let i = 1; i < openSet.length; i += 1) {
                if (openSet[i].f < openSet[lowestIndex].f) {
                    lowestIndex = i;
                }
            }

            return openSet.splice(lowestIndex, 1)[0];
        };

        const goalKey = `${goalTile.x},${goalTile.y}`;

        const visited = new Set<string>();

        while (openSet.length > 0) {
            const current = popLowest();

            if (!current) {
                break;
            }

            const currentKey = `${current.x},${current.y}`;

            if (currentKey === goalKey) {
                const pathTiles: Phaser.Math.Vector2[] = [];
                let iterateKey: string | undefined = currentKey;

                while (iterateKey) {
                    const [ix, iy] = iterateKey.split(',').map(Number);
                    pathTiles.push(new Phaser.Math.Vector2(ix, iy));

                    const prev = cameFrom.get(iterateKey);
                    iterateKey = prev ? `${prev.x},${prev.y}` : undefined;
                }

                pathTiles.reverse();

                const worldPath = pathTiles.map((tile) => this.tileToWorld(tile.x, tile.y));

                if (worldPath.length > 1) {
                    worldPath.shift();
                }

                return worldPath;
            }

            visited.add(currentKey);

            neighborOffsets.forEach((offset) => {
                const neighborX = current.x + offset.x;
                const neighborY = current.y + offset.y;
                const neighborKey = `${neighborX},${neighborY}`;

                if (!this.isWalkableTile(neighborX, neighborY) || visited.has(neighborKey)) {
                    return;
                }

                const tentativeG = gScores[current.y][current.x] + 1;

                if (tentativeG >= gScores[neighborY][neighborX]) {
                    return;
                }

                cameFrom.set(neighborKey, { x: current.x, y: current.y });
                gScores[neighborY][neighborX] = tentativeG;
                fScores[neighborY][neighborX] =
                    tentativeG +
                    Math.abs(goalTile.x - neighborX) +
                    Math.abs(goalTile.y - neighborY);

                if (!openSet.some((node) => node.x === neighborX && node.y === neighborY)) {
                    openSet.push({ x: neighborX, y: neighborY, f: fScores[neighborY][neighborX] });
                }
            });
        }

        return null;
    }

    private clearNpcTarget(npc: Character): void {
        if (this.npcMoveTargets.delete(npc)) {
            npc.idle();
        }
    }

    private updateNpcMovement(): void {
        const now = this.time.now;

        this.npcMoveTargets.forEach((target, npc) => {
            if (!npc) {
                return;
            }

            if (this.isInteracting && this.activeNpc === npc) {
                npc.idle();
                return;
            }

            const npcPosition = new Phaser.Math.Vector2(npc.sprite.x, npc.sprite.y);
            let targetPosition: Phaser.Math.Vector2;

            if (target.kind === 'player') {
                targetPosition = new Phaser.Math.Vector2(
                    this.player.sprite.x,
                    this.player.sprite.y,
                );
            } else {
                targetPosition = target.position.clone();
            }

            const distanceToTarget = Phaser.Math.Distance.Between(
                npcPosition.x,
                npcPosition.y,
                targetPosition.x,
                targetPosition.y,
            );

            if (distanceToTarget <= target.stopDistance) {
                this.npcMoveTargets.delete(npc);
                if (target.onArrive) {
                    try {
                        target.onArrive();
                    } catch (error) {
                        console.error('NPC arrival callback failed', error);
                    }
                }
                npc.idle();
                return;
            }

            if (target.kind === 'player') {
                const playerTile = this.worldToTile(targetPosition);
                const tileChanged = !playerTile.equals(target.lastPlayerTile);

                if (tileChanged || now >= target.nextPathRefresh) {
                    const recalculated = this.computePath(npcPosition, targetPosition);

                    if (recalculated) {
                        target.path = recalculated;
                        target.pathIndex = 0;
                    } else {
                        target.path = [];
                        target.pathIndex = 0;
                    }

                    target.lastPlayerTile = playerTile;
                    target.nextPathRefresh = now + 300;
                }
            } else if (now >= target.nextPathRefresh) {
                const refreshedPath = this.computePath(npcPosition, target.position);

                if (refreshedPath) {
                    target.path = refreshedPath;
                    target.pathIndex = 0;
                }

                target.nextPathRefresh = now + 800;
            }

            if (target.path.length === 0) {
                npc.moveTowards(targetPosition);
                return;
            }

            const currentWaypoint = target.path[target.pathIndex];

            if (!currentWaypoint) {
                npc.moveTowards(targetPosition);
                return;
            }

            const waypointDistance = Phaser.Math.Distance.Between(
                npcPosition.x,
                npcPosition.y,
                currentWaypoint.x,
                currentWaypoint.y,
            );

            if (waypointDistance <= 6) {
                target.pathIndex += 1;

                if (target.pathIndex >= target.path.length) {
                    if (distanceToTarget <= target.stopDistance + 6) {
                        this.npcMoveTargets.delete(npc);
                        npc.idle();
                        return;
                    }

                    const recalculated = this.computePath(npcPosition, targetPosition);

                    if (recalculated && recalculated.length > 0) {
                        target.path = recalculated;
                        target.pathIndex = 0;
                    } else {
                        target.path = [];
                        target.pathIndex = 0;
                        npc.moveTowards(targetPosition);
                        target.nextPathRefresh = target.kind === 'player' ? now + 300 : now + 800;
                        return;
                    }

                    target.nextPathRefresh = target.kind === 'player' ? now + 300 : now + 800;
                }
            }

            const waypoint = target.path[target.pathIndex];

            if (waypoint) {
                npc.moveTowards(waypoint);
            } else {
                npc.moveTowards(targetPosition);
            }
        });
    }

    private updateLatestNpcMessage(text: string, options?: { skipTrim?: boolean }): void {
        const cleaned = options?.skipTrim ? text : text.trim();

        if (!cleaned) {
            return;
        }

        const last = this.threadMessages[this.threadMessages.length - 1];

        if (last && last.speaker === 'npc') {
            last.text = cleaned;
            this.refreshThreadDisplay();
            return;
        }

        this.appendThreadMessage('npc', cleaned, this.npcDisplayName, { skipTrim: true });
    }

    private updateNpcReasoningDisplay(content: string | null): void {
        const trimmed = content?.trim();

        if (!trimmed) {
            if (!this.currentReasoningText) {
                return;
            }

            this.currentReasoningText = '';
            this.npcReasoningText.setVisible(false).setText('');
            this.layoutDialogueTexts();
            return;
        }

        if (trimmed === this.currentReasoningText) {
            return;
        }

        this.currentReasoningText = trimmed;

        const label = `${this.npcDisplayName} (thinking)`;
        const separator = label.trimEnd().endsWith(':') ? ' ' : ': ';
        this.npcReasoningText.setText(`${label}${separator}${trimmed}`);
        this.npcReasoningText.setVisible(true);
        this.layoutDialogueTexts();
    }

    private refreshThreadDisplay(typingText?: string): void {
        const recent = this.threadMessages.slice(-2);

        if (typingText !== undefined) {
            const latest = recent[recent.length - 1];

            if (latest) {
                const displayText = this.formatThreadEntry(latest);
                const color = latest.speaker === 'player' ? '#00ff9d' : '#ffffff';
                this.npcDialogue.setText(displayText).setColor(color).setVisible(true);
            } else {
                this.npcDialogue.setVisible(false);
            }

            this.playerInputText
                .setText(typingText || this.inputPrefix)
                .setColor('#00ff9d')
                .setVisible(true);
            this.layoutDialogueTexts();
            return;
        }

        if (recent.length === 0) {
            this.npcDialogue.setVisible(false);
            this.playerInputText.setVisible(false);
            return;
        }

        if (recent.length === 1) {
            this.npcDialogue.setVisible(false);
            const entry = recent[0];
            const color = entry.speaker === 'player' ? '#00ff9d' : '#ffffff';
            this.playerInputText
                .setText(this.formatThreadEntry(entry))
                .setColor(color)
                .setVisible(true);
            this.layoutDialogueTexts();
            return;
        }

        const [older, latest] = recent;
        const olderColor = older.speaker === 'player' ? '#00ff9d' : '#ffffff';
        const latestColor = latest.speaker === 'player' ? '#00ff9d' : '#ffffff';

        this.npcDialogue
            .setText(this.formatThreadEntry(older))
            .setColor(olderColor)
            .setVisible(true);

        this.playerInputText
            .setText(this.formatThreadEntry(latest))
            .setColor(latestColor)
            .setVisible(true);

        this.layoutDialogueTexts();
    }

    private formatThreadEntry(entry: {
        speaker: 'npc' | 'player';
        text: string;
        prefix?: string;
    }): string {
        if (entry.speaker === 'npc') {
            const name = entry.prefix ?? this.npcDisplayName;
            const separator = name.trimEnd().endsWith(':') ? ' ' : ': ';
            return `${name}${separator}${entry.text}`;
        }

        const prefix = entry.prefix ?? this.inputPrefix;
        return `${prefix}${entry.text}`;
    }

    private layoutDialogueTexts(): void {
        const marginBottom = 24;
        const spacing = 12;
        const anchorX = 24;
        const cameraHeight = this.cameras.main.height;
        let nextBottom = cameraHeight - marginBottom;

        const stack: Phaser.GameObjects.Text[] = [
            this.playerInputText,
            this.npcDialogue,
            this.npcReasoningText,
        ];

        stack.forEach((text) => {
            if (!text.visible) {
                return;
            }

            text.setOrigin(0, 1).setPosition(anchorX, nextBottom);

            const bounds = text.getBounds();
            nextBottom = Math.max(bounds.top - spacing, marginBottom);
        });
    }

    private attachDebugListener(agent: DialogueAgent): void {
        this.detachDebugListenerIfNeeded();
        const conversationId = this.activeConversationId;
        const npcName = agent.getDisplayName();

        this.detachDebugListener = agent.addDebugEventListener((event) => {
            if (conversationId !== this.activeConversationId) {
                return;
            }

            this.debugPanel.appendEvent(npcName, event);
        });
    }

    private detachDebugListenerIfNeeded(): void {
        if (this.detachDebugListener) {
            this.detachDebugListener();
            this.detachDebugListener = undefined;
        }
    }

    private stopNpcConversationForNpc(npc: Character, preserveWith?: Character): void {
        const key = this.npcConversationParticipants.get(npc);

        if (!key) {
            return;
        }

        const tracked = this.npcConversationStates.get(key);

        if (tracked) {
            if (preserveWith && tracked.state.participants.includes(preserveWith)) {
                return;
            }
            tracked.state.cancelled = true;
            tracked.state.participants.forEach((participant) => {
                this.hideNpcSpeechBubble(participant);
            });
        }
    }

    private getNpcDisplayName(npc: Character): string {
        return npc.getDialogueAgent()?.getDisplayName() ?? 'NPC';
    }

    private getConversationPartnerId(npc: Character): string {
        const index = this.npcs.indexOf(npc);
        const baseName = this.getNpcDisplayName(npc)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .replace(/-{2,}/g, '-');

        const safeBase = baseName || 'mentor';
        const suffix = index >= 0 ? index : this.npcs.length;
        return `npc:${safeBase}-${suffix}`;
    }

    private getNpcPairKey(a: Character, b: Character): string {
        const ids = [this.getConversationPartnerId(a), this.getConversationPartnerId(b)].sort();
        return ids.join('::');
    }

    private isNpcBusy(npc: Character): boolean {
        return this.activeNpc === npc || this.npcConversationParticipants.has(npc);
    }

    private areNpcsClose(npcA: Character, npcB: Character): boolean {
        const distance = Phaser.Math.Distance.Between(
            npcA.sprite.x,
            npcA.sprite.y,
            npcB.sprite.x,
            npcB.sprite.y,
        );

        return distance <= this.npcConversationRadius;
    }

    private updateNpcConversations(): void {
        const now = this.time.now;

        for (let i = 0; i < this.npcs.length; i += 1) {
            const npcA = this.npcs[i];
            const agentA = npcA.getDialogueAgent();

            if (!agentA || this.isNpcBusy(npcA)) {
                continue;
            }

            for (let j = i + 1; j < this.npcs.length; j += 1) {
                const npcB = this.npcs[j];
                const agentB = npcB.getDialogueAgent();

                if (!agentB || this.isNpcBusy(npcB)) {
                    continue;
                }

                if (!this.areNpcsClose(npcA, npcB)) {
                    continue;
                }

                const pairKey = this.getNpcPairKey(npcA, npcB);

                if (this.npcConversationStates.has(pairKey)) {
                    continue;
                }

                const cooldownUntil = this.npcConversationCooldowns.get(pairKey) ?? 0;

                if (now < cooldownUntil) {
                    continue;
                }

                this.startNpcConversation(npcA, npcB, pairKey);
            }
        }
    }

    private startNpcConversation(npcA: Character, npcB: Character, pairKey: string): void {
        if (this.npcConversationStates.has(pairKey)) {
            return;
        }

        const state: NpcConversationState = {
            participants: [npcA, npcB],
            cancelled: false,
        };

        const promise = this.runNpcConversation(pairKey, state);
        this.npcConversationStates.set(pairKey, { state, promise });
        this.npcConversationParticipants.set(npcA, pairKey);
        this.npcConversationParticipants.set(npcB, pairKey);

        promise
            .catch((error) => {
                console.error('NPC conversation failed', error);
            })
            .finally(() => {
                this.npcConversationStates.delete(pairKey);
                this.npcConversationParticipants.delete(npcA);
                this.npcConversationParticipants.delete(npcB);
                this.npcConversationCooldowns.set(
                    pairKey,
                    this.time.now + this.npcConversationCooldownMs,
                );
                this.hideNpcSpeechBubble(npcA);
                this.hideNpcSpeechBubble(npcB);
            });
    }

    private async runNpcConversation(pairKey: string, state: NpcConversationState): Promise<void> {
        const [npcA, npcB] = state.participants;
        const agentA = npcA.getDialogueAgent();
        const agentB = npcB.getDialogueAgent();

        if (!agentA || !agentB) {
            return;
        }

        let lastMessageFromA: string | null = null;
        let lastMessageFromB: string | null = null;
        const maxTurns = 6;

        for (let turn = 0; turn < maxTurns; turn += 1) {
            if (state.cancelled) {
                break;
            }

            if (this.activeNpc === npcA || this.activeNpc === npcB) {
                break;
            }

            if (!this.areNpcsClose(npcA, npcB)) {
                break;
            }

            const speaker = turn % 2 === 0 ? npcA : npcB;
            const listener = speaker === npcA ? npcB : npcA;
            const speakerAgent = speaker.getDialogueAgent();
            const listenerAgent = listener.getDialogueAgent();

            if (!speakerAgent || !listenerAgent) {
                break;
            }

            const incoming = speaker === npcA ? (lastMessageFromB ?? '') : (lastMessageFromA ?? '');
            const partnerId = this.getConversationPartnerId(listener);

            if (!incoming && speakerAgent.getItems(partnerId).length === 0) {
                const initial = speakerAgent.getInitialMessage().trim();

                if (initial) {
                    speakerAgent.recordMessage(partnerId, 'assistant', initial);
                    const listenerPartnerId = this.getConversationPartnerId(speaker);
                    listenerAgent.recordMessage(listenerPartnerId, 'user', initial);
                    this.showNpcSpeechBubble(speaker, initial);
                    this.debugPanel.appendEvent(this.getNpcDisplayName(speaker), {
                        source: 'agent',
                        payload: {
                            type: 'npc-initial-message',
                            to: this.getNpcDisplayName(listener),
                            message: initial,
                            pair: pairKey,
                        },
                    });

                    if (speaker === npcA) {
                        lastMessageFromA = initial;
                    } else {
                        lastMessageFromB = initial;
                    }

                    await this.sleep(900);
                    continue;
                }
            }

            const response = await this.collectAgentResponse(speakerAgent, partnerId, incoming);

            if (state.cancelled) {
                break;
            }

            const trimmed = response.trim();

            if (!trimmed) {
                continue;
            }

            speaker.idle();
            listener.idle();
            speaker.faceTowards(listener.sprite);
            listener.faceTowards(speaker.sprite);

            this.showNpcSpeechBubble(speaker, trimmed);
            this.debugPanel.appendEvent(this.getNpcDisplayName(speaker), {
                source: 'agent',
                payload: {
                    type: 'npc-dialogue',
                    to: this.getNpcDisplayName(listener),
                    message: trimmed,
                    pair: pairKey,
                },
            });

            const listenerPartnerId = this.getConversationPartnerId(speaker);
            listenerAgent.recordMessage(listenerPartnerId, 'user', trimmed);

            if (speaker === npcA) {
                lastMessageFromA = trimmed;
            } else {
                lastMessageFromB = trimmed;
            }

            await this.sleep(1200);
        }
    }

    private async collectAgentResponse(
        agent: DialogueAgent,
        partnerId: string,
        incomingMessage: string,
    ): Promise<string> {
        let aggregated = '';

        try {
            for await (const chunk of agent.streamResponse(partnerId, incomingMessage)) {
                if (!chunk || chunk.type !== 'text') {
                    continue;
                }

                aggregated += chunk.text ?? '';
            }
        } catch (error) {
            console.error('Failed to stream NPC response', error);
        }

        return aggregated;
    }

    private showNpcSpeechBubble(npc: Character, text: string): void {
        const trimmed = text.trim();

        if (!trimmed) {
            return;
        }

        let bubble = this.npcSpeechBubbles.get(npc);

        if (!bubble) {
            bubble = this.add
                .text(0, 0, trimmed, {
                    fontFamily: 'monospace',
                    fontSize: '16px',
                    color: '#ffffff',
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    padding: { left: 8, right: 8, top: 4, bottom: 4 },
                    align: 'center',
                    wordWrap: { width: 220 },
                })
                .setOrigin(0.5, 1)
                .setDepth(900);

            this.npcSpeechBubbles.set(npc, bubble);
        }

        bubble.setText(trimmed);
        bubble.setVisible(true);
        this.npcSpeechBubbleTimers.set(npc, this.time.now + 5000);
        bubble.setPosition(npc.sprite.x, npc.sprite.y - 72);
    }

    private hideNpcSpeechBubble(npc: Character): void {
        const bubble = this.npcSpeechBubbles.get(npc);

        if (bubble) {
            bubble.setVisible(false);
        }

        this.npcSpeechBubbleTimers.delete(npc);
    }

    private updateNpcSpeechBubbles(): void {
        this.npcSpeechBubbles.forEach((bubble, npc) => {
            if (!bubble.visible) {
                return;
            }

            bubble.setPosition(npc.sprite.x, npc.sprite.y - 72);
        });
    }

    private expireNpcSpeechBubbles(): void {
        const now = this.time.now;

        this.npcSpeechBubbleTimers.forEach((deadline, npc) => {
            if (now >= deadline) {
                this.hideNpcSpeechBubble(npc);
            }
        });
    }

    private async sleep(ms: number): Promise<void> {
        await new Promise<void>((resolve) => {
            this.time.delayedCall(ms, resolve);
        });
    }

    private prepareForPlayerInput(): void {
        this.updateNpcReasoningDisplay(null);
        this.playerInput = '';
        this.isAwaitingInput = true;
        this.refreshThreadDisplay(`${this.inputPrefix}`);
    }

    private handleTyping(event: KeyboardEvent): void {
        if (!this.isAwaitingInput) {
            return;
        }

        if (!this.activeNpc || !this.activeAgent) {
            return;
        }

        if (event.key === 'Backspace') {
            event.preventDefault();
            this.playerInput = this.playerInput.slice(0, -1);
        } else if (event.key === 'Enter') {
            event.preventDefault();

            const trimmed = this.playerInput.trim();

            if (!trimmed) {
                return;
            }

            this.appendThreadMessage('player', trimmed, this.inputPrefix);
            const partnerId = this.playerConversationId;
            this.activeAgent.recordMessage(partnerId, 'user', trimmed);
            this.playerInput = '';
            this.isAwaitingInput = false;
            this.refreshThreadDisplay();
            this.requestNpcResponse(partnerId, trimmed);
            return;
        } else if (event.key.length === 1) {
            if (this.playerInput.length >= 240) {
                return;
            }

            this.playerInput += event.key;
        }

        this.refreshThreadDisplay(`${this.inputPrefix}${this.playerInput}`);
    }

    private requestNpcResponse(partnerId: string, playerMessage: string): void {
        const agent = this.activeAgent;

        if (!agent || !this.activeNpc) {
            this.handleNpcResponse("I'll jot that down and get back to you soon.");
            return;
        }

        this.isWaitingForResponse = true;
        const conversationId = this.activeConversationId;

        const stream = agent.streamResponse(partnerId, playerMessage);

        this.consumeNpcStream(stream, conversationId).catch((error) => {
            console.error('Failed to process response stream', error);

            if (conversationId !== this.activeConversationId) {
                return;
            }

            this.handleNpcResponse("Sorry, I'm having trouble responding right now.");
        });
    }

    private async consumeNpcStream(
        stream: AsyncIterable<DialogueStreamChunk>,
        conversationId: number,
    ): Promise<void> {
        let hasTextChunk = false;
        let aggregate = '';
        let reasoningAggregate = '';

        for await (const chunk of stream) {
            if (conversationId !== this.activeConversationId) {
                this.updateNpcReasoningDisplay(null);
                return;
            }

            if (!chunk) {
                continue;
            }

            if (chunk.type === 'reasoning') {
                reasoningAggregate += chunk.text ?? '';
                this.updateNpcReasoningDisplay(reasoningAggregate);
                continue;
            }

            if (chunk.type !== 'text') {
                continue;
            }

            const text = chunk.text ?? '';

            if (!text) {
                continue;
            }

            aggregate += text;

            if (!hasTextChunk) {
                this.appendThreadMessage('npc', aggregate, this.npcDisplayName, { skipTrim: true });
                hasTextChunk = true;
            } else {
                this.updateLatestNpcMessage(aggregate, { skipTrim: true });
            }
        }

        this.updateNpcReasoningDisplay(null);

        if (conversationId !== this.activeConversationId) {
            return;
        }

        const response = aggregate.trim() || 'Thanks for the update!';

        if (!hasTextChunk) {
            this.appendThreadMessage('npc', response, this.npcDisplayName);
        } else {
            this.updateLatestNpcMessage(response, { skipTrim: true });
        }

        this.isWaitingForResponse = false;
        this.prepareForPlayerInput();
    }

    private handleNpcResponse(rawResponse: string): void {
        this.updateNpcReasoningDisplay(null);
        const response = rawResponse.trim() || 'Thanks for the update!';

        this.appendThreadMessage('npc', response, this.npcDisplayName);
        this.activeAgent?.recordMessage(this.playerConversationId, 'assistant', response);
        this.isWaitingForResponse = false;
        this.prepareForPlayerInput();
    }
}
