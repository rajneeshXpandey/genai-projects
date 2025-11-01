import Phaser from 'phaser';

export class Preloader extends Phaser.Scene {
    constructor() {
        super({ key: 'Preloader' });
    }

    preload(): void {
        this.load.setPath('assets');

        this.load.json('data', 'maps/openai/simplified/Level_0/data.json');
        this.load.text('lvl1_collisions', 'maps/openai/simplified/Level_0/Collisions.csv');
        this.load.spritesheet('steve', 'sprites/steve.png', {
            frameWidth: 48,
            frameHeight: 96,
        });
        this.load.spritesheet('sam', 'sprites/sam.png', {
            frameWidth: 48,
            frameHeight: 96,
        });
        this.load.spritesheet('wendy', 'sprites/wendy.png', {
            frameWidth: 48,
            frameHeight: 96,
        });

        for (let i = 1; i < 8; i++) {
            this.load.spritesheet(`misc_${i}`, `sprites/misc_${i}.png`, {
                frameWidth: 48,
                frameHeight: 96,
            });
        }

        this.load.on('progress', (progress: number) => {
            console.log(`Loading: ${Math.round(progress * 100)}%`);
        });
    }

    async create(): Promise<void> {
        try {
            await this.loadLayerImages();
        } catch (error) {
            console.warn('Failed to load map layers', error);
        }

        try {
            await this.ensureFonts();
        } catch (error) {
            console.warn('Failed to confirm fonts before start', error);
        }

        this.scene.start('StartScene');
    }

    private async ensureFonts(): Promise<void> {
        const fontDocument = document as Document & { fonts?: FontFaceSet };
        const fontSet = fontDocument.fonts;

        if (!fontSet) {
            return;
        }

        const descriptors = ['48px "Abaddon Bold"', '32px "Abaddon Light"'];
        const loaders = descriptors.map((descriptor) => fontSet.load(descriptor));

        await Promise.allSettled(loaders);
    }

    private loadLayerImages(): Promise<void> {
        const data = this.cache.json.get('data') as { layers?: string[] } | undefined;
        const layers = data?.layers ?? [];

        if (layers.length === 0) {
            return Promise.resolve();
        }

        let queued = false;

        layers.forEach((layer) => {
            if (!this.textures.exists(layer)) {
                this.load.image(layer, `maps/openai/simplified/Level_0/${layer}`);
                queued = true;
            }
        });

        if (!queued) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            this.load.once(Phaser.Loader.Events.COMPLETE, () => {
                resolve();
            });
            this.load.start();
        });
    }
}
