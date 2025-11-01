import Phaser from 'phaser';
import { Preloader } from './preloader';
import { MainScene } from './scenes/MainScene';
import { StartScene } from './scenes/StartScene';

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: 'phaser-container',
    width: 1024,
    height: 768,
    backgroundColor: '#1c172e',
    pixelArt: true,
    roundPixels: false,
    fps: {
        target: 60,
        forceSetTimeOut: true,
    },
    max: {
        width: 800,
        height: 600,
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
        default: 'arcade',
        arcade: {
            // debug: true,
            gravity: { x: 0, y: 0 },
        },
    },
    scene: [Preloader, StartScene, MainScene],
};

new Phaser.Game(config);
