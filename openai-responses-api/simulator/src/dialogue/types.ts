import type { FunctionTool, ResponseStreamEvent } from 'openai/resources/responses/responses';

export type DialogueRole = 'user' | 'assistant';

export interface DialogueTextMessage {
    type: 'message';
    role: DialogueRole;
    content: string;
}

export interface DialogueFunctionCallOutputEntry {
    type: 'function_call_output';
    callId: string;
    output: string;
}

export type DialogueHistoryEntry = DialogueTextMessage | DialogueFunctionCallOutputEntry;

export interface DialogueContext {
    partnerId: string;
    incomingMessage: string;
    history: DialogueHistoryEntry[];
    characterName: string;
}

export interface DialogueAgentOptions {
    name: string;
    initialMessage: string;
}

export type DialogueStreamChunk = {
    type: 'text' | 'reasoning';
    text: string;
};

export type DialogueDebugEvent =
    | { source: 'openai.responses'; payload: ResponseStreamEvent }
    | { source: 'default-stream'; payload: string }
    | { source: 'agent'; payload: Record<string, unknown> };

export type DialogueDebugEventListener = (event: DialogueDebugEvent) => void;

export interface DialogueToolInvocation {
    partnerId: string;
    arguments: unknown;
}

export interface DialogueToolResult {
    assistantMessage?: string;
    toolOutput?: string;
}

export type DialogueToolHandler = (
    payload: DialogueToolInvocation,
) => Promise<DialogueToolResult | void> | DialogueToolResult | void;

export interface DialogueToolRegistration {
    definition: FunctionTool;
    handler: DialogueToolHandler;
}

export interface DialogueAgent {
    getDisplayName(): string;
    getInputPrefix(): string;
    getInitialMessage(): string;
    getItems(partnerId: string): DialogueTextMessage[];
    recordMessage(partnerId: string, role: DialogueRole, content: string): void;
    recordFunctionOutput(partnerId: string, callId: string, output: string): void;
    resetConversation(partnerId?: string): void;
    streamResponse(partnerId: string, incomingMessage: string): AsyncIterable<DialogueStreamChunk>;
    addDebugEventListener(listener: DialogueDebugEventListener): () => void;
    registerTool(registration: DialogueToolRegistration): void;
}
