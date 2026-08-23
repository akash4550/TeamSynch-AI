import { GeminiProvider } from '../providers/gemini.provider';

const originalFetch = global.fetch;
const mockFetch = jest.fn();

const jsonResponse = (
  body: unknown,
  status = 200,
  headers?: Record<string, string>,
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });

describe('GeminiProvider', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  const createProvider = () =>
    new GeminiProvider({
      apiKey: 'test-gemini-key',
      model: 'gemini-2.5-flash',
      embeddingModel: 'gemini-embedding-2',
      embeddingDimensions: 1536,
      timeoutMs: 5000,
      maxOutputTokens: 200,
    });

  it('maps a completion request and normalizes the Gemini response', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        candidates: [
          {
            content: {
              parts: [{ text: 'Gemini answer' }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
        modelVersion: 'gemini-2.5-flash',
      }),
    );

    const response = await createProvider().generateCompletion({
      prompt: 'What is RAG?',
      systemPrompt: 'Be concise.',
      maxTokens: 100,
      temperature: 0.2,
      stopSequences: ['END'],
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('models/gemini-2.5-flash:generateContent');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-goog-api-key': 'test-gemini-key',
    });

    expect(JSON.parse(init.body as string)).toEqual({
      systemInstruction: {
        parts: [{ text: 'Be concise.' }],
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: 'What is RAG?' }],
        },
      ],
      generationConfig: {
        maxOutputTokens: 100,
        temperature: 0.2,
        stopSequences: ['END'],
      },
    });

    expect(response).toEqual({
      text: 'Gemini answer',
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });
  });

  it('requests a 1536-dimensional embedding', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        embedding: {
          values: [0.1, -0.2, 0.3],
        },
        usageMetadata: {
          promptTokenCount: 7,
        },
      }),
    );

    const response = await createProvider().generateEmbedding('Aurora release notes');

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('models/gemini-embedding-2:embedContent');

    expect(JSON.parse(init.body as string)).toEqual({
      content: {
        parts: [{ text: 'Aurora release notes' }],
      },
      outputDimensionality: 1536,
    });

    expect(response).toEqual({
      embedding: [0.1, -0.2, 0.3],
      model: 'gemini-embedding-2',
      usage: {
        totalTokens: 7,
      },
    });
  });

  it('maps Gemini rate limits to a safe 429 provider error', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 429,
            status: 'RESOURCE_EXHAUSTED',
            message: 'Quota exceeded',
          },
        },
        429,
        { 'retry-after': '4' },
      ),
    );

    await expect(
      createProvider().generateEmbedding('test'),
    ).rejects.toMatchObject({
      name: 'AIProviderError',
      message: 'Gemini API rate limit exceeded',
      statusCode: 429,
      provider: 'gemini',
      providerCode: 'RESOURCE_EXHAUSTED',
      retryAfterSeconds: 4,
    });
  });
});
