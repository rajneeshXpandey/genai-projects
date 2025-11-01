import { OpenAI } from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import {
    BaseDialogueAgent,
    type DialogueAgentOptions,
    type DialogueContext,
    type DialogueStreamChunk,
    type DialogueTextMessage,
} from './BaseDialogueAgent';
import { ResponseStreamParams } from 'openai/lib/responses/ResponseStream';
import { ResponseItem } from 'openai/resources/responses/responses';

export interface ChatCompletionRequestOptions {
    type: 'chat_completions';
    model?: string;
    messages?: Array<ChatCompletionMessageParam>;
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    presence_penalty?: number;
    frequency_penalty?: number;
}

export interface ChatCompletionDialogueAgentOptions extends DialogueAgentOptions {
    request_options?: ChatCompletionRequestOptions | ResponseStreamParams;
}

export class OpenAIDialogueAgent extends BaseDialogueAgent {
    private readonly client: OpenAI;
    private readonly requestOptions?: ChatCompletionRequestOptions | ResponseStreamParams;
    private items: ResponseItem[] = [];

    constructor(config: ChatCompletionDialogueAgentOptions) {
        super(config);

        this.requestOptions = config.request_options;

        const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('API key required');
        }

        this.client = new OpenAI({
            apiKey,
            dangerouslyAllowBrowser: true,
        });
        this.items = [{ type: 'message', role: 'assistant', content: this.getInitialMessage() }];
    }

    getCCMessages(context: DialogueContext): ChatCompletionMessageParam[] {
        const trajectory =
            (this.requestOptions?.type === 'chat_completions' && this.requestOptions.messages) ||
            [];

        return trajectory.concat(
            context.history
                .filter((entry): entry is DialogueTextMessage => entry.type === 'message')
                .map((entry) => ({
                    role: entry.role,
                    content: entry.content,
                })),
        );
    }

    protected async *provideResponseStream(
        context: DialogueContext,
    ): AsyncGenerator<DialogueStreamChunk> {
        const userMessage = context.history[context.history.length - 1];

        const { type: _deprecatedType, ...params } = (this.requestOptions ?? {}) as Record<
            string,
            unknown
        >;
        this.items = [...this.items, userMessage];

        restartLoop: while (true) {
            const { data: stream } = await this.client.responses
                .create({
                    ...params,
                    input: this.items,
                    stream: true,
                })
                .withResponse();

            let restartRequested = false;

            try {
                for await (const event of stream) {
                    this.emitDebugEvent({ source: 'openai.responses', payload: event });
                    console.log(event);

                    switch (event.type) {
                        case 'response.output_item.done': {
                            this.items.push(event.item);

                            if (event.item.type === 'image_generation_call') {
                                const result = event.item.result;
                                if (result) {
                                    const newTab = window.open();
                                    newTab?.document.write(
                                        `<img src="data:image/png;base64,${result}" />`,
                                    );
                                }
                                break;
                            }

                            if (event.item.type === 'mcp_approval_request') {
                                window.confirm(`Run ${event.item.name}?`);

                                this.items.push({
                                    type: 'mcp_approval_response',
                                    approval_request_id: event.item.id,
                                    approve: true,
                                });
                                restartRequested = true;
                            }

                            if (event.item.type === 'mcp_call') {
                                yield {
                                    type: 'reasoning',
                                    text: `
calling ${event.item.server_label}.${event.item.name}...
`,
                                };
                            }

                            break;
                        }
                        case 'response.output_text.delta':
                            yield { type: 'text', text: event.delta };
                            break;
                        case 'response.reasoning_summary_text.delta':
                            yield { type: 'reasoning', text: event.delta };
                            break;
                        case 'response.web_search_call.searching':
                            yield {
                                type: 'reasoning',
                                text: `
searching the web...
                                `,
                            };
                            break;
                        case 'response.image_generation_call.in_progress':
                            yield {
                                type: 'reasoning',
                                text: `
generating image...
                                `,
                            };
                            break;
                        case 'response.mcp_list_tools.in_progress':
                            yield {
                                type: 'reasoning',
                                text: `
listing tools...
                                `,
                            };
                            break;
                        case 'response.completed':
                            console.log(event.response);
                            break;
                    }

                    if (restartRequested) {
                        break;
                    }
                }
            } finally {
                if (restartRequested && typeof stream.abort === 'function') {
                    stream.abort();
                }
            }

            if (!restartRequested) {
                break restartLoop;
            }
        }
    }
}

