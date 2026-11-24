export interface GeminiTextPart {
  text: string;
}

export interface GeminiInlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

export interface GeminiFunctionCallPart {
  functionCall: {
    name: string;
    args?: Record<string, unknown>;
  };
  thoughtSignature?: string;
}

export interface GeminiFunctionResponsePart {
  functionResponse: {
    name: string;
    response: Record<string, unknown>;
  };
}

export type GeminiPart =
  | GeminiTextPart
  | GeminiInlineDataPart
  | GeminiFunctionCallPart
  | GeminiFunctionResponsePart;

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'OBJECT';
    properties: Record<
      string,
      {
        type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'ARRAY';
        description: string;
        enum?: string[];
      }
    >;
    required?: string[];
  };
}

interface GenerateContentResponse {
  candidates?: Array<{
    content?: {
      role?: string;
      parts?: Array<Record<string, unknown>>;
    };
    finishReason?: string;
    groundingMetadata?: {
      groundingChunks?: Array<{
        web?: { uri?: string; title?: string };
      }>;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

export interface ToolExecutionResult {
  result: Record<string, unknown>;
  attachments?: string[];
}

export type ToolExecutor = (
  name: string,
  args: Record<string, unknown>,
) => Promise<ToolExecutionResult>;

export class GeminiClient {
  private readonly apiKey: string;
  private readonly baseUrl =
    'https://generativelanguage.googleapis.com/v1beta/models';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async callApi(
    model: string,
    body: Record<string, unknown>,
  ): Promise<GenerateContentResponse> {
    const url = `${this.baseUrl}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as GenerateContentResponse;
    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`Gemini API (${model}) error: ${msg}`);
    }
    return json;
  }

  /**
   * Executes a real-time web search using Gemini's built-in Google Search grounding.
   */
  async groundedWebSearch(
    query: string,
    model = 'gemini-3.5-flash',
  ): Promise<{ summary: string; sources: Array<{ title: string; url: string }> }> {
    const today = new Date().toISOString().slice(0, 10);
    const json = await this.callApi(model, {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Today is ${today}. Search the web and provide an accurate, up-to-date factual summary (include exact numbers, dates, and prices where relevant) for: ${query}`,
            },
          ],
        },
      ],
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0.2,
      },
    });

    const candidate = json.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];
    const summary = parts
      .map((p) => (typeof p.text === 'string' ? p.text : ''))
      .join('')
      .trim();

    const sources: Array<{ title: string; url: string }> = [];
    const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
    for (const chunk of chunks) {
      if (chunk.web?.uri) {
        sources.push({
          title: chunk.web.title ?? chunk.web.uri,
          url: chunk.web.uri,
        });
      }
    }

    return {
      summary: summary || 'No web search results returned.',
      sources: sources.slice(0, 6),
    };
  }

  /**
   * Runs a multi-step tool-calling conversation turn and returns the final
   * assistant text plus any file attachments produced by tools.
   */
  async chatWithTools(params: {
    model: string;
    systemInstruction: string;
    history: GeminiContent[];
    declarations: GeminiFunctionDeclaration[];
    executeTool: ToolExecutor;
    onToolCall?: (toolName: string, args: Record<string, unknown>) => Promise<void> | void;
    maxToolTurns?: number;
  }): Promise<{ text: string; attachments: string[]; updatedHistory: GeminiContent[] }> {
    const workingHistory: GeminiContent[] = [...params.history];
    const collectedAttachments: string[] = [];
    const maxTurns = params.maxToolTurns ?? 6;

    for (let turn = 0; turn < maxTurns; turn += 1) {
      const json = await this.callApi(params.model, {
        systemInstruction: {
          parts: [{ text: params.systemInstruction }],
        },
        contents: workingHistory,
        tools:
          params.declarations.length > 0
            ? [{ functionDeclarations: params.declarations }]
            : undefined,
        generationConfig: {
          temperature: 0.4,
        },
      });

      const rawParts = json.candidates?.[0]?.content?.parts ?? [];
      if (rawParts.length === 0) {
        return {
          text: 'ขออภัย ไม่ได้รับคำตอบจากโมเดล กรุณาลองใหม่อีกครั้งครับ',
          attachments: collectedAttachments,
          updatedHistory: workingHistory,
        };
      }

      // Preserve raw model parts (including thoughtSignature if present)
      workingHistory.push({
        role: 'model',
        parts: rawParts as unknown as GeminiPart[],
      });

      const functionCalls = rawParts.filter(
        (p): p is { functionCall: { name: string; args?: Record<string, unknown> } } =>
          typeof p.functionCall === 'object' && p.functionCall !== null,
      );

      if (functionCalls.length === 0) {
        const finalText = rawParts
          .map((p) => (typeof p.text === 'string' ? p.text : ''))
          .join('')
          .trim();

        return {
          text: finalText || '(ไม่มีข้อความตอบกลับ)',
          attachments: collectedAttachments,
          updatedHistory: workingHistory,
        };
      }

      // Execute requested tool calls sequentially and feed results back
      const responseParts: GeminiFunctionResponsePart[] = [];
      for (const callPart of functionCalls) {
        const toolName = callPart.functionCall.name;
        const toolArgs = callPart.functionCall.args ?? {};
        await params.onToolCall?.(toolName, toolArgs);

        try {
          const outcome = await params.executeTool(toolName, toolArgs);
          if (outcome.attachments) {
            collectedAttachments.push(...outcome.attachments);
          }
          responseParts.push({
            functionResponse: {
              name: toolName,
              response: outcome.result,
            },
          });
        } catch (err) {
          responseParts.push({
            functionResponse: {
              name: toolName,
              response: {
                error: err instanceof Error ? err.message : String(err),
              },
            },
          });
        }
      }

      workingHistory.push({
        role: 'user',
        parts: responseParts,
      });
    }

    return {
      text: 'ดำเนินการครบจำนวนรอบสูงสุดของเครื่องมือแล้ว กรุณาลองสั่งใหม่อีกครั้งแบบเจาะจงขึ้นครับ',
      attachments: collectedAttachments,
      updatedHistory: workingHistory,
    };
  }
}
