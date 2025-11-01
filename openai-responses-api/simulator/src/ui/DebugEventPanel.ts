import type { DialogueDebugEvent } from '../dialogue/BaseDialogueAgent';

type LogMap = Map<string, string[]>;

export class DebugEventPanel {
    private static instance: DebugEventPanel | null = null;

    public static getInstance(): DebugEventPanel {
        if (!DebugEventPanel.instance) {
            DebugEventPanel.instance = new DebugEventPanel();
        }

        return DebugEventPanel.instance;
    }

    private readonly panel: HTMLDivElement;
    private readonly toggleButton: HTMLButtonElement;
    private readonly caret: HTMLSpanElement;
    private readonly title: HTMLSpanElement;
    private readonly content: HTMLDivElement;
    private readonly logs: LogMap = new Map();
    private collapsed = true;
    private activeNpcName: string | null = null;

    private constructor() {
        const mountPoint = document.getElementById('debug-panel-root');

        if (!mountPoint) {
            throw new Error('Missing #debug-panel-root mount element for DebugEventPanel');
        }

        this.panel = document.createElement('div');
        this.panel.className = 'debug-panel collapsed';

        this.toggleButton = document.createElement('button');
        this.toggleButton.type = 'button';
        this.toggleButton.className = 'debug-panel__header';
        this.toggleButton.setAttribute('aria-expanded', 'false');

        this.caret = document.createElement('span');
        this.caret.className = 'debug-panel__caret';
        this.toggleButton.appendChild(this.caret);

        this.title = document.createElement('span');
        this.title.className = 'debug-panel__title';
        this.toggleButton.appendChild(this.title);

        this.toggleButton.addEventListener('click', () => this.toggle());

        this.content = document.createElement('div');
        this.content.className = 'debug-panel__content';
        const contentId = 'debug-panel-content';
        this.content.id = contentId;
        this.toggleButton.setAttribute('aria-controls', contentId);

        this.panel.append(this.toggleButton, this.content);
        mountPoint.appendChild(this.panel);

        this.refreshHeader();
        this.render();
    }

    public registerNpc(name: string): void {
        if (!name.trim()) {
            return;
        }

        if (this.logs.has(name)) {
            return;
        }

        this.logs.set(name, []);

        if (!this.collapsed) {
            this.render();
        }
    }

    public setActiveNpc(name: string | null): void {
        this.activeNpcName = name ?? null;
        this.refreshHeader();
    }

    public appendEvent(npcName: string, event: DialogueDebugEvent): void {
        const name = npcName.trim() || 'Unknown NPC';
        this.registerNpc(name);

        const entries = this.logs.get(name);

        if (!entries) {
            return;
        }

        const timestamp = new Date().toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });

        const payload = this.formatPayload(event);
        entries.push(`[${timestamp}] ${event.source}: ${payload}`);

        const maxEntries = 80;
        if (entries.length > maxEntries) {
            entries.splice(0, entries.length - maxEntries);
        }

        if (!this.collapsed) {
            this.render();
        }
    }

    private toggle(): void {
        this.collapsed = !this.collapsed;
        this.panel.classList.toggle('collapsed', this.collapsed);
        this.panel.classList.toggle('expanded', !this.collapsed);
        this.toggleButton.setAttribute('aria-expanded', String(!this.collapsed));

        this.refreshHeader();

        if (!this.collapsed) {
            this.render();
        }
    }

    private refreshHeader(): void {
        const caretSymbol = this.collapsed ? '▸' : '▾';
        this.caret.textContent = caretSymbol;

        const npcLabel = this.activeNpcName ?? 'No active NPC';
        this.title.textContent = ` Stream Events — ${npcLabel}`;
    }

    private render(): void {
        const sections: string[] = [];

        this.logs.forEach((entries, npcName) => {
            sections.push(`[${npcName}]`);

            if (entries.length === 0) {
                sections.push('  (no events yet)');
            } else {
                sections.push(...entries.map((entry) => `  ${entry}`));
            }

            sections.push('');
        });

        const output = sections.join('\n').trimEnd();
        this.content.textContent = output || '(no NPC events yet)';
    }

    private formatPayload(event: DialogueDebugEvent): string {
        if (event.source === 'default-stream') {
            return event.payload;
        }

        try {
            return JSON.stringify(event.payload);
        } catch (error) {
            console.error('[DebugEventPanel] Failed to stringify debug payload', error);
            return '[unserializable payload]';
        }
    }
}
