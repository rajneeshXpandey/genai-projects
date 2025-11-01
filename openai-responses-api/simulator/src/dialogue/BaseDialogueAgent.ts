import type { FunctionTool } from 'openai/resources/responses/responses';

import type {
    DialogueAgent,
    DialogueAgentOptions,
    DialogueContext,
    DialogueDebugEvent,
    DialogueDebugEventListener,
    DialogueFunctionCallOutputEntry,
    DialogueHistoryEntry,
    DialogueRole,
    DialogueStreamChunk,
    DialogueTextMessage,
    DialogueToolHandler,
    DialogueToolRegistration,
} from './types';

export abstract class BaseDialogueAgent implements DialogueAgent {
    protected readonly conversations = new Map<string, DialogueHistoryEntry[]>();
    private readonly debugListeners = new Set<DialogueDebugEventListener>();
    private readonly toolRegistry = new Map<string, DialogueToolRegistration>();

    protected constructor(protected readonly options: DialogueAgentOptions) {}

    public getDisplayName(): string {
        return this.options.name;
    }

    public getInputPrefix(): string {
        return 'You: ';
    }

    public getInitialMessage(): string {
        return this.options.initialMessage;
    }

    public getItems(partnerId: string): DialogueTextMessage[] {
        const conversation = this.getConversation(partnerId);
        return conversation.filter(
            (entry): entry is DialogueTextMessage => entry.type === 'message',
        );
    }

    public recordMessage(partnerId: string, role: DialogueRole, content: string): void {
        const trimmed = content.trim();

        if (!trimmed) {
            return;
        }

        const conversation = this.getConversation(partnerId);
        conversation.push({ type: 'message', role, content: trimmed });
    }

    public recordFunctionOutput(partnerId: string, callId: string, output: string): void {
        const trimmed = output.trim();

        if (!callId) {
            return;
        }

        const conversation = this.getConversation(partnerId);
        conversation.push({ type: 'function_call_output', callId, output: trimmed || 'done' });
    }

    public resetConversation(partnerId?: string): void {
        if (partnerId) {
            this.conversations.delete(partnerId);
            return;
        }

        this.conversations.clear();
    }

    public addDebugEventListener(listener: DialogueDebugEventListener): () => void {
        this.debugListeners.add(listener);

        return () => {
            this.debugListeners.delete(listener);
        };
    }

    public registerTool(registration: DialogueToolRegistration): void {
        const name = registration.definition.name;

        if (!name || name.trim().length === 0) {
            throw new Error('Dialogue tool definitions must include a non-empty name.');
        }

        this.toolRegistry.set(name, registration);
    }

    public streamResponse(
        partnerId: string,
        incomingMessage: string,
    ): AsyncIterable<DialogueStreamChunk> {
        const context = this.createContext(partnerId, incomingMessage);
        const self = this;

        return (async function* stream(): AsyncGenerator<DialogueStreamChunk> {
            let aggregated = '';

            let source: AsyncIterable<DialogueStreamChunk>;

            try {
                source = self.provideResponseStream(context);
            } catch (error) {
                console.error('[DialogueAgent] Failed to create response stream:', error);
                self.emitDebugEvent({
                    source: 'agent',
                    payload: {
                        type: 'stream-error',
                        message: error instanceof Error ? error.message : String(error),
                    },
                });
                source = self.buildDefaultStream(context);
            }

            for await (const chunk of source) {
                if (!chunk) {
                    continue;
                }

                if (chunk.type === 'text') {
                    aggregated += chunk.text ?? '';
                }

                yield chunk;
            }

            const trimmed = aggregated.trim();

            if (trimmed.length > 0) {
                self.recordMessage(partnerId, 'assistant', trimmed);
            }
        })();
    }

    protected createContext(partnerId: string, incomingMessage: string): DialogueContext {
        return {
            partnerId,
            incomingMessage,
            history: [...this.getConversation(partnerId)],
            characterName: this.options.name,
        };
    }

    protected abstract provideResponseStream(
        context: DialogueContext,
    ): AsyncIterable<DialogueStreamChunk>;

    protected buildDefaultResponse(context: DialogueContext): string {
        const { incomingMessage, characterName } = context;

        if (!incomingMessage.trim()) {
            return `${characterName} is ready when you are!`;
        }

        return `Appreciate the update on "${incomingMessage}". Let's keep pushing forward!`;
    }

    protected async *buildDefaultStream(
        context: DialogueContext,
    ): AsyncGenerator<DialogueStreamChunk> {
        const fallback = this.buildDefaultResponse(context);
        this.emitDebugEvent({ source: 'default-stream', payload: fallback });
        yield { type: 'text', text: fallback };
    }

    private getConversation(partnerId: string): DialogueHistoryEntry[] {
        let conversation = this.conversations.get(partnerId);

        if (!conversation) {
            conversation = [];
            this.conversations.set(partnerId, conversation);
        }

        return conversation;
    }

    protected emitDebugEvent(event: DialogueDebugEvent): void {
        this.debugListeners.forEach((listener) => {
            try {
                listener(event);
            } catch (error) {
                console.error('[DialogueAgent] Debug listener threw', error);
            }
        });
    }

    protected getRegisteredToolDefinitions(): FunctionTool[] {
        return Array.from(this.toolRegistry.values()).map((entry) => entry.definition);
    }

    protected getToolHandler(name: string): DialogueToolHandler | undefined {
        return this.toolRegistry.get(name)?.handler;
    }
}

export type {
    DialogueAgent,
    DialogueAgentOptions,
    DialogueContext,
    DialogueDebugEvent,
    DialogueDebugEventListener,
    DialogueFunctionCallOutputEntry,
    DialogueHistoryEntry,
    DialogueRole,
    DialogueStreamChunk,
    DialogueTextMessage,
    DialogueToolHandler,
    DialogueToolInvocation,
    DialogueToolRegistration,
    DialogueToolResult,
} from './types';
