import { BaseDialogueAgent, type DialogueContext, type DialogueStreamChunk } from './BaseDialogueAgent';

export interface StaticDialogueAgentOptions {
    name: string;
    initialMessage: string;
    responses: string[];
    loop?: boolean;
    onDepletionMessage?: string;
}

export class StaticDialogueAgent extends BaseDialogueAgent {
    private readonly partnerIndices = new Map<string, number>();

    constructor(private readonly staticOptions: StaticDialogueAgentOptions) {
        super(staticOptions);
    }

    public override resetConversation(partnerId?: string): void {
        super.resetConversation(partnerId);
        if (partnerId) {
            this.partnerIndices.delete(partnerId);
        } else {
            this.partnerIndices.clear();
        }
    }

    protected async *provideResponseStream(
        context: DialogueContext,
    ): AsyncGenerator<DialogueStreamChunk> {
        const { responses, loop = false, onDepletionMessage } = this.staticOptions;
        const partnerId = context.partnerId;
        const currentIndex = this.partnerIndices.get(partnerId) ?? 0;

        if (responses.length === 0) {
            const fallback = this.buildDefaultResponse(context);
            this.emitDebugEvent({ source: 'default-stream', payload: fallback });
            yield { type: 'text', text: fallback };
            return;
        }

        if (!loop && currentIndex >= responses.length) {
            const fallback = onDepletionMessage ?? this.buildDefaultResponse(context);
            this.emitDebugEvent({ source: 'default-stream', payload: fallback });
            yield { type: 'text', text: fallback };
            return;
        }

        const normalizedIndex = loop
            ? currentIndex % responses.length
            : Math.min(currentIndex, responses.length - 1);

        const response = responses[normalizedIndex];

        const nextIndexValue = loop
            ? (normalizedIndex + 1) % responses.length
            : normalizedIndex + 1;

        this.partnerIndices.set(partnerId, nextIndexValue);

        this.emitDebugEvent({ source: 'default-stream', payload: response });
        yield { type: 'text', text: response };
    }
}
