describe('createAIProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // TOOLCHAIN (ledger #13 — 2026-08-05): jest.resetModules() removed —
    // it was functionally dead here (createAIProvider reads process.env at
    // CALL time, so per-test isolation comes from the env copy below)
    // and it is precisely what parked the jest-30 vm-module linker under
    // --experimental-vm-modules (needed for unpdf's dynamic import in the
    // text-extraction suites): every suite PASSED, then the runner never
    // exited with zero open handles detected. Bisected and proven with
    // minimal probes; do not reintroduce resetModules in this suite.
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('creates the mock provider when configured for MOCK', async () => {
    process.env.AI_PROVIDER = 'MOCK';

    // TOOLCHAIN (ledger #13 — 2026-08-05): plain require — the dynamic
    // import variant was tied to a resetModules pattern that parked the
    // jest-30 vm-module linker under --experimental-vm-modules. Module
    // freshness is unnecessary: createAIProvider reads process.env at CALL
    // time, and each test rebuilds process.env in beforeEach above.
    const { createAIProvider } = require(
      '../providers/ai-provider.factory'
    );

    const provider = createAIProvider();

    expect(provider.name).toBe('mock');
  });

  it('creates the OpenAI provider when fully configured', async () => {
    process.env.AI_PROVIDER = 'OPENAI';
    process.env.AI_MODEL = 'test-openai-model';
    process.env.OPENAI_API_KEY = 'test-openai-key';

    // TOOLCHAIN (ledger #13 — 2026-08-05): plain require — the dynamic
    // import variant was tied to a resetModules pattern that parked the
    // jest-30 vm-module linker under --experimental-vm-modules. Module
    // freshness is unnecessary: createAIProvider reads process.env at CALL
    // time, and each test rebuilds process.env in beforeEach above.
    const { createAIProvider } = require(
      '../providers/ai-provider.factory'
    );

    const provider = createAIProvider();

    expect(provider.name).toBe('openai');
  });

  it('rejects incomplete OpenAI configuration', async () => {
    process.env.AI_PROVIDER = 'OPENAI';
    delete process.env.AI_MODEL;
    delete process.env.OPENAI_API_KEY;

    // TOOLCHAIN (ledger #13 — 2026-08-05): plain require — the dynamic
    // import variant was tied to a resetModules pattern that parked the
    // jest-30 vm-module linker under --experimental-vm-modules. Module
    // freshness is unnecessary: createAIProvider reads process.env at CALL
    // time, and each test rebuilds process.env in beforeEach above.
    const { createAIProvider } = require(
      '../providers/ai-provider.factory'
    );

    expect(() => createAIProvider()).toThrow(
      'OpenAI provider configuration is incomplete',
    );
  });
});