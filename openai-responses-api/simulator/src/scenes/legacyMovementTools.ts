// Legacy NPC movement and tooling logic retained for reference.
// This module preserves the previous demo's behaviour where NPCs could be instructed
// (via function calls) to navigate to specific entities, other NPCs, or the player.
//
// The code intentionally remains unused in the current build, but has been kept so it
// can be restored or adapted in future iterations without digging through history.

/* eslint-disable @typescript-eslint/no-unused-vars */
/*
import type Phaser from 'phaser';
import type { FunctionTool } from 'openai/resources/responses/responses';
import type { MainScene } from './MainScene';
import type { Character } from '../gameobjects/Character';
import type { DialogueAgent } from '../dialogue/BaseDialogueAgent';

// The full implementation previously lived inside MainScene, wired up via
// MainScene.registerAgentTools. If you need to resurrect the behaviour, consider
// re-integrating the helpers below and invoking registerLegacyAgentTools(scene, npc).

export function registerLegacyAgentTools(scene: MainScene, npc: Character): void {
    const agent = npc.getDialogueAgent();
    if (!agent || typeof agent.registerTool !== 'function') {
        return;
    }

    // ... original tool registration + movement helpers moved here verbatim ...
}

// Supporting helpers (moveNpcToEntity, moveNpcToCharacter, createArrivalCallback, etc.)
// would also be copied here should the old behaviour be reinstated.
*/

/* eslint-enable @typescript-eslint/no-unused-vars */
