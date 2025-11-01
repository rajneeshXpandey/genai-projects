import Phaser from 'phaser';
import type { DialogueAgent } from '../dialogue/BaseDialogueAgent';

type Direction = 'up' | 'down' | 'left' | 'right';

type AnimationKeyType = 'idle' | 'walk' | 'sit';

type FrameConfig = Record<AnimationKeyType, Record<Direction, number[] | null>>;

export interface CharacterConfig {
    scene: Phaser.Scene;
    texture: string;
    npc?: boolean;
    sprite?: Phaser.Physics.Arcade.Sprite;
    position: Phaser.Types.Math.Vector2Like;
    colliders?: Phaser.Physics.Arcade.StaticGroup;
    frameConfig?: FrameConfig;
    speed?: number;
    dialogueAgent?: DialogueAgent;
    initialDirection?: Direction;
}

const defaultFrames: FrameConfig = {
    walk: {
        down: [131, 132, 133, 134, 135],
        left: [124, 125, 126, 127, 128, 129],
        right: [112, 113, 114, 115, 116, 117],
        up: [118, 119, 120, 121, 122, 123],
    },
    idle: {
        down: [131],
        left: [124],
        right: [112],
        up: [118],
    },
    sit: {
        left: [26, 27, 28, 29, 30, 31],
        right: [32, 33, 34, 35, 36, 37],
        down: null,
        up: null,
    },
};

export class Character {
    public readonly sprite: Phaser.Physics.Arcade.Sprite;

    public readonly speed: number;

    private facing: Direction = 'down';

    private readonly scene: Phaser.Scene;

    private readonly texture: string;

    private readonly frames: FrameConfig;

    private readonly dialogueAgent?: DialogueAgent;

    constructor({
        scene,
        texture,
        position,
        sprite,
        npc = false,
        colliders,
        frameConfig,
        speed = 150,
        dialogueAgent,
        initialDirection = 'down',
    }: CharacterConfig) {
        this.scene = scene;
        this.texture = texture;
        this.frames = frameConfig ?? defaultFrames;
        this.speed = speed;
        this.dialogueAgent = dialogueAgent;
        this.facing = initialDirection;

        const startingIdleFrames = this.frames.idle[this.facing];
        const initialFrame =
            Array.isArray(startingIdleFrames) && startingIdleFrames.length > 0
                ? startingIdleFrames[0]
                : 0;

        this.sprite =
            sprite ??
            scene.physics.add
                .sprite(position.x, position.y, texture, initialFrame)
                .setOrigin(0.5, 0.75)
                .setCollideWorldBounds(true);

        this.buildAnimations();

        if (colliders) {
            scene.physics.add.collider(this.sprite, colliders);
        }

        this.playAnimation(this.animationKey('idle'));

        const rawBody = this.sprite.body as Phaser.Physics.Arcade.Body | null;

        if (!rawBody) {
            throw new Error('Character sprite is missing an arcade physics body.');
        }

        const body = rawBody;
        const size = new Phaser.Geom.Rectangle(0, 0, 24, 58);
        const offset = { x: 12, y: 58 };

        this.sprite.setSize(size.width, size.height);
        this.sprite.setDepth(100);
        this.sprite.setOffset(offset.x, offset.y);

        body.setAllowGravity(false);
        body.setAllowRotation(false);
        body.setMaxVelocity(this.speed, this.speed);
        body.setMaxSpeed(this.speed);
        body.setAcceleration(0, 0);
        body.setBounce(0, 0);

        const isStatic = speed <= 0;

        if (npc) {
            body.setImmovable(isStatic);
            body.moves = !isStatic;
            body.pushable = false;

            if (isStatic) {
                body.setVelocity(0, 0);
                body.setDamping(false);
                body.setDrag(0, 0);
                body.setAllowDrag(false);
            } else {
                body.setDamping(true);
                body.setDrag(0.9, 0.9);
                body.setAllowDrag(true);
            }
        } else {
            body.setImmovable(false);
            body.moves = true;
            body.pushable = true;
            body.setDamping(false);
            body.setDrag(0, 0);
            body.setAllowDrag(false);
        }
    }

    public getDialogueAgent(): DialogueAgent | undefined {
        return this.dialogueAgent;
    }

    public move(direction: Phaser.Math.Vector2): void {
        if (direction.lengthSq() > 0) {
            direction.normalize().scale(this.speed);
            this.sprite.setVelocity(direction.x, direction.y);

            const absX = Math.abs(direction.x);
            const absY = Math.abs(direction.y);

            if (absX > absY) {
                this.facing = direction.x > 0 ? 'right' : 'left';
            } else {
                this.facing = direction.y > 0 ? 'down' : 'up';
            }

            const walkKey = this.animationKey('walk');
            this.playAnimation(walkKey);
        } else {
            this.sprite.setVelocity(0, 0);
            const idleKey = this.animationKey('idle');
            this.playAnimation(idleKey);
        }
    }

    public moveTowards(target: Phaser.Types.Math.Vector2Like): void {
        const direction = new Phaser.Math.Vector2(
            target.x - this.sprite.x,
            target.y - this.sprite.y,
        );
        this.move(direction);
    }

    public idle(): void {
        this.sprite.setVelocity(0, 0);
        const idleKey = this.animationKey('idle');
        this.playAnimation(idleKey);
    }

    public faceTowards(target: Phaser.Types.Math.Vector2Like): void {
        const dx = target.x - this.sprite.x;
        const dy = target.y - this.sprite.y;

        if (dx === 0 && dy === 0) {
            return;
        }

        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        if (absX > absY) {
            this.facing = dx > 0 ? 'right' : 'left';
        } else {
            this.facing = dy > 0 ? 'down' : 'up';
        }

        const idleFrames = this.frames.idle[this.facing];
        const frame = idleFrames?.[0];

        if (frame !== undefined) {
            this.sprite.setFrame(frame);
        }

        const idleKey = this.animationKey('idle');
        this.playAnimation(idleKey);
    }

    public setBody(size: Phaser.Geom.Rectangle, offset: Phaser.Types.Math.Vector2Like): void {
        const body = this.sprite.body as Phaser.Physics.Arcade.Body;
        body.setSize(size.width, size.height);
        body.setOffset(offset.x, offset.y);
    }

    private animationKey(type: AnimationKeyType): string {
        return `${this.texture}-${type}-${this.facing}`;
    }

    private buildAnimations(): void {
        (Object.entries(this.frames.walk) as Array<[Direction, number[]]>).forEach(
            ([direction, frames]) => {
                this.ensureAnimation(`${this.texture}-walk-${direction}`, frames, 8);
            },
        );

        (Object.entries(this.frames.idle) as Array<[Direction, number[]]>).forEach(
            ([direction, frames]) => {
                this.ensureAnimation(`${this.texture}-idle-${direction}`, frames, 4);
            },
        );
    }

    private ensureAnimation(key: string, frames: number[], frameRate: number): void {
        if (this.scene.anims.exists(key)) {
            return;
        }

        this.scene.anims.create({
            key,
            frames: this.scene.anims.generateFrameNumbers(this.texture, { frames }),
            frameRate,
            repeat: -1,
        });
    }

    private playAnimation(key: string): void {
        const current = this.sprite.anims.currentAnim?.key;

        if (current === key) {
            return;
        }

        this.sprite.anims.play(key, true);

        if (this.sprite.anims.currentAnim) {
            this.sprite.anims.setProgress(Math.random());
        }
    }
}
