/**
 * Tests for the entry point — the main() wiring function.
 *
 * Since index.ts runs main() at module level (line 211), importing the
 * module immediately executes main(). We use vi.mock() for every dependency
 * so the real file system, serial ports, and network are never touched.
 *
 * Because Vitest caches dynamic imports, we use vi.resetModules() before
 * each test to get a fresh execution of main().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mock stubs — these are the fake objects that mocked constructors return
// ---------------------------------------------------------------------------

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

const mockMessageLogger = {
  logMessage: vi.fn().mockReturnValue(1),
  close: vi.fn(),
  pruneOldMessages: vi.fn().mockReturnValue(0),
};

const mockQueue = {
  enqueue: vi.fn().mockReturnValue(1),
  markSent: vi.fn(),
  dequeueNext: vi.fn().mockReturnValue(null),
  close: vi.fn(),
  getPendingCount: vi.fn().mockReturnValue(0),
};

const mockRetryProcessor = {
  start: vi.fn(),
  stop: vi.fn(),
};

const mockWrite = vi.fn();
const mockGetConnection = vi.fn().mockReturnValue({ write: mockWrite });

const mockConnectionManager = {
  startAll: vi.fn().mockResolvedValue(undefined),
  stopAll: vi.fn().mockResolvedValue(undefined),
  getStatuses: vi.fn().mockReturnValue([]),
  onData: vi.fn(),
  on: vi.fn(),
  getConnection: mockGetConnection,
};

const mockPipeline = {
  on: vi.fn(),
  processASTM: vi.fn().mockResolvedValue(undefined),
  processHL7v2: vi.fn().mockResolvedValue(undefined),
  processCombilyzer: vi.fn().mockResolvedValue(undefined),
};

// Track transport instances so we can invoke their on('message') callbacks
const astmTransportInstances: Array<{ on: ReturnType<typeof vi.fn>; receive: ReturnType<typeof vi.fn> }> = [];
const mllpTransportInstances: Array<{ on: ReturnType<typeof vi.fn>; receive: ReturnType<typeof vi.fn> }> = [];

const mockServerClose = vi.fn((cb?: () => void) => { if (cb) cb(); });
const mockServerListen = vi.fn((_port: number, _host: string, cb: () => void) => {
  cb();
  return { close: mockServerClose };
});
const mockExpressApp = { listen: mockServerListen };

const mockMedplumClient = {};

const mockConfig = {
  logging: { level: 'info', dir: './logs', maxFiles: 7, maxSizeMb: 10 },
  queue: { dbPath: ':memory:/queue.db', retryIntervalMs: 5000 },
  medplum: { baseUrl: 'https://api.medplum.com', clientId: 'id', clientSecret: 'secret', projectId: 'proj' },
  api: { port: 3001, host: '0.0.0.0' },
  analyzers: [
    { id: 'astm-1', name: 'ASTM Analyzer', protocol: 'astm', connection: 'serial', port: 'COM1', baudRate: 9600, enabled: true },
    { id: 'hl7-1', name: 'HL7 Analyzer', protocol: 'hl7v2', connection: 'tcp', host: '127.0.0.1', tcpPort: 5000, enabled: true },
    { id: 'combi-1', name: 'Combilyzer', protocol: 'combilyzer', connection: 'serial', port: 'COM2', baudRate: 9600, enabled: true },
    { id: 'unsup-1', name: 'Unsupported', protocol: 'siemens-lis3', connection: 'serial', port: 'COM3', baudRate: 9600, enabled: true },
  ],
};

// ---------------------------------------------------------------------------
// Module mocks — vi.mock() is hoisted to the top of the file by Vitest
// ---------------------------------------------------------------------------

vi.mock('dotenv/config', () => ({}));

vi.mock('./config/configLoader.js', () => ({
  loadConfig: vi.fn(() => mockConfig),
}));

vi.mock('./logging/appLogger.js', () => ({
  createAppLogger: vi.fn(() => mockLogger),
}));

vi.mock('./logging/messageLogger.js', () => ({
  MessageLogger: vi.fn(() => mockMessageLogger),
}));

vi.mock('./queue/localQueue.js', () => ({
  LocalQueue: vi.fn(() => mockQueue),
}));

vi.mock('./fhir/medplumClient.js', () => ({
  createMedplumClient: vi.fn().mockResolvedValue(mockMedplumClient),
}));

vi.mock('./fhir/resultSender.js', () => ({
  sendLabResult: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('./mappers/fhirMapper.js', () => ({
  mapLabResultToFHIR: vi.fn(() => ({ observations: [], diagnosticReport: {} })),
}));

vi.mock('./queue/retryProcessor.js', () => ({
  RetryProcessor: vi.fn(() => mockRetryProcessor),
}));

vi.mock('./connections/connectionManager.js', () => ({
  ConnectionManager: vi.fn(() => mockConnectionManager),
}));

vi.mock('./protocols/astm/transport.js', () => ({
  ASTMTransport: vi.fn(() => {
    const inst = { on: vi.fn(), receive: vi.fn() };
    astmTransportInstances.push(inst);
    return inst;
  }),
}));

vi.mock('./protocols/hl7v2/mllpTransport.js', () => {
  const VT = 0x0b;
  const FS = 0x1c;
  const CR = 0x0d;
  const ctor = vi.fn(() => {
    const inst = { on: vi.fn(), receive: vi.fn() };
    mllpTransportInstances.push(inst);
    return inst;
  });
  // Static method used by index.ts to wrap ACK messages
  (ctor as unknown as Record<string, unknown>).wrapFrame = (msg: string) =>
    Buffer.from([VT, ...Buffer.from(msg), FS, CR]);
  return { MLLPTransport: ctor };
});

vi.mock('./protocols/hl7v2/ack.js', () => ({
  buildACK: vi.fn(() => 'MSH|^~\\&|ACK\rMSA|AA|MSG001\r'),
}));

vi.mock('./protocols/hl7v2/parser.js', () => ({
  parseORU: vi.fn(() => ({
    msh: { fieldSeparator: '|', encodingCharacters: '^~\\&', messageControlId: 'MSG001', versionId: '2.3.1', sendingApplication: 'Analyzer', sendingFacility: 'Lab' },
    pid: null,
    obr: { specimenId: '12345678' },
    obx: [],
    rawMessage: 'MSH|test',
    receivedAt: new Date().toISOString(),
  })),
}));

vi.mock('./pipeline/resultPipeline.js', () => ({
  ResultPipeline: vi.fn(() => mockPipeline),
}));

vi.mock('./api/server.js', () => ({
  createServer: vi.fn(() => mockExpressApp),
}));

vi.mock('./api/resultStore.js', () => ({
  ResultStore: vi.fn(() => ({ add: vi.fn(), evictExpired: vi.fn().mockReturnValue(0) })),
}));

// ---------------------------------------------------------------------------
// Track process.on signal handlers so we can invoke them in tests
// ---------------------------------------------------------------------------

const signalHandlers = new Map<string, Function>();

describe('index.ts — main() startup wiring', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let processOnSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let consoleErrorSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    signalHandlers.clear();
    astmTransportInstances.length = 0;
    mllpTransportInstances.length = 0;

    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    processOnSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, handler: Function) => {
      signalHandlers.set(event, handler);
      return process;
    }) as never);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    processOnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  /** Helper: import index.ts (which runs main()) and wait for async completion */
  async function runMain(): Promise<void> {
    await import('./index.js');
    // Give the async main() and its microtasks time to settle
    await new Promise((r) => setTimeout(r, 50));
  }

  it('starts successfully — creates all services and begins listening', async () => {
    await runMain();

    // Config loaded
    const { loadConfig } = await import('./config/configLoader.js');
    expect(loadConfig).toHaveBeenCalled();

    // Logger created
    const { createAppLogger } = await import('./logging/appLogger.js');
    expect(createAppLogger).toHaveBeenCalledWith(mockConfig.logging);

    // Medplum client authenticated
    const { createMedplumClient } = await import('./fhir/medplumClient.js');
    expect(createMedplumClient).toHaveBeenCalledWith(mockConfig.medplum);

    // Pipeline created
    const { ResultPipeline } = await import('./pipeline/resultPipeline.js');
    expect(ResultPipeline).toHaveBeenCalled();

    // Retry processor started with configured interval
    expect(mockRetryProcessor.start).toHaveBeenCalledWith(5000);

    // Connection manager created and started
    const { ConnectionManager } = await import('./connections/connectionManager.js');
    expect(ConnectionManager).toHaveBeenCalledWith(mockConfig.analyzers);
    expect(mockConnectionManager.startAll).toHaveBeenCalled();

    // REST API server created and listening
    const { createServer } = await import('./api/server.js');
    expect(createServer).toHaveBeenCalled();
    expect(mockServerListen).toHaveBeenCalledWith(3001, '0.0.0.0', expect.any(Function));

    // Startup log messages
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('starting'));
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('running'));
  });

  it('wires onData callbacks for ASTM, HL7v2, and Combilyzer analyzers', async () => {
    await runMain();

    // 3 supported analyzers should have onData wired (astm-1, hl7-1, combi-1)
    expect(mockConnectionManager.onData).toHaveBeenCalledTimes(3);
    expect(mockConnectionManager.onData).toHaveBeenCalledWith('astm-1', expect.any(Function));
    expect(mockConnectionManager.onData).toHaveBeenCalledWith('hl7-1', expect.any(Function));
    expect(mockConnectionManager.onData).toHaveBeenCalledWith('combi-1', expect.any(Function));
  });

  it('creates ASTM and MLLP transports for the right analyzers', async () => {
    await runMain();

    const { ASTMTransport } = await import('./protocols/astm/transport.js');
    const { MLLPTransport } = await import('./protocols/hl7v2/mllpTransport.js');

    expect(ASTMTransport).toHaveBeenCalledTimes(1);
    expect(MLLPTransport).toHaveBeenCalledTimes(1);
  });

  it('logs a warning for unsupported protocol (siemens-lis3)', async () => {
    await runMain();

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Unsupported protocol'),
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('siemens-lis3'),
    );
  });

  it('registers SIGINT and SIGTERM shutdown handlers', async () => {
    await runMain();

    expect(signalHandlers.has('SIGINT')).toBe(true);
    expect(signalHandlers.has('SIGTERM')).toBe(true);
  });

  it('graceful shutdown closes all services in correct order', async () => {
    await runMain();

    // Trigger SIGINT handler (simulates Ctrl+C)
    const handler = signalHandlers.get('SIGINT');
    expect(handler).toBeDefined();
    await handler!();
    await new Promise((r) => setTimeout(r, 50));

    expect(mockServerClose).toHaveBeenCalled();
    expect(mockRetryProcessor.stop).toHaveBeenCalled();
    expect(mockConnectionManager.stopAll).toHaveBeenCalled();
    expect(mockQueue.close).toHaveBeenCalled();
    expect(mockMessageLogger.close).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('SIGTERM also triggers graceful shutdown', async () => {
    await runMain();

    const handler = signalHandlers.get('SIGTERM');
    expect(handler).toBeDefined();
    await handler!();
    await new Promise((r) => setTimeout(r, 50));

    expect(mockRetryProcessor.stop).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('calls process.exit(1) on fatal startup error', async () => {
    // Make loadConfig throw to simulate a config file error
    const { loadConfig } = await import('./config/configLoader.js');
    (loadConfig as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('Config file not found');
    });

    await import('./index.js');
    await new Promise((r) => setTimeout(r, 50));

    expect(consoleErrorSpy).toHaveBeenCalledWith('Fatal error:', expect.any(Error));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('subscribes to pipeline events for logging', async () => {
    await runMain();

    // pipeline.on should be called with 'pipeline' event
    expect(mockPipeline.on).toHaveBeenCalledWith('pipeline', expect.any(Function));
  });

  it('pipeline error events get logged via logger.error', async () => {
    await runMain();

    // Find the pipeline event handler that was registered
    const onCall = mockPipeline.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'pipeline',
    );
    expect(onCall).toBeDefined();

    const pipelineHandler = onCall![1] as (event: Record<string, unknown>) => void;

    // Simulate an error event
    pipelineHandler({ stage: 'error', analyzerId: 'astm-1', error: 'Parse failed' });
    expect(mockLogger.error).toHaveBeenCalledWith('Pipeline error', {
      analyzerId: 'astm-1',
      error: 'Parse failed',
    });

    // Simulate a non-error event
    pipelineHandler({ stage: 'parsed', analyzerId: 'astm-1', messageId: 42 });
    expect(mockLogger.debug).toHaveBeenCalledWith('Pipeline: parsed', {
      analyzerId: 'astm-1',
      messageId: 42,
    });
  });

  it('initializes MessageLogger with derived messages.db path', async () => {
    await runMain();

    const { MessageLogger } = await import('./logging/messageLogger.js');
    // Config has dbPath ':memory:/queue.db', so messages path = ':memory:/messages.db'
    expect(MessageLogger).toHaveBeenCalledWith(':memory:/messages.db');
  });

  it('initializes LocalQueue with configured dbPath', async () => {
    await runMain();

    const { LocalQueue } = await import('./queue/localQueue.js');
    expect(LocalQueue).toHaveBeenCalledWith(':memory:/queue.db');
  });

  it('passes correct dependencies to createServer', async () => {
    await runMain();

    const { createServer } = await import('./api/server.js');
    expect(createServer).toHaveBeenCalledWith(
      expect.objectContaining({
        health: expect.objectContaining({
          getStatuses: expect.any(Function),
          startTime: expect.any(Date),
          version: '0.1.0',
        }),
        status: expect.objectContaining({
          getStatuses: expect.any(Function),
        }),
        messages: expect.objectContaining({
          logger: mockMessageLogger,
          retryQueue: mockQueue,
        }),
        results: expect.objectContaining({
          resultStore: expect.any(Object),
        }),
      }),
    );
  });

  // -------------------------------------------------------------------------
  // Callback wiring tests — exercise the data-flow callbacks set up in main()
  // -------------------------------------------------------------------------

  it('ASTM onData callback feeds bytes to transport.receive', async () => {
    await runMain();

    // Find the onData callback registered for astm-1
    const astmOnDataCall = mockConnectionManager.onData.mock.calls.find(
      (call: unknown[]) => call[0] === 'astm-1',
    );
    expect(astmOnDataCall).toBeDefined();
    const onDataCb = astmOnDataCall![1] as (data: Buffer) => void;

    // The ASTM transport instance created during main()
    expect(astmTransportInstances).toHaveLength(1);
    const transport = astmTransportInstances[0];

    // Feed bytes — should be forwarded to transport.receive
    const buf = Buffer.from('test data');
    onDataCb(buf);
    expect(transport.receive).toHaveBeenCalledWith(buf);
  });

  it('ASTM transport message callback sends frames to pipeline.processASTM', async () => {
    await runMain();

    const transport = astmTransportInstances[0];
    // Find the on('message') handler
    const onMsgCall = transport.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'message',
    );
    expect(onMsgCall).toBeDefined();
    const msgHandler = onMsgCall![1] as (frames: string[]) => void;

    // Invoke the handler with fake frames
    msgHandler(['H|\\^&|||Test', 'L|1|N']);
    await new Promise((r) => setTimeout(r, 10));

    expect(mockPipeline.processASTM).toHaveBeenCalledWith('astm-1', 'H|\\^&|||Test\nL|1|N');
  });

  it('ASTM transport message callback logs error when pipeline.processASTM rejects', async () => {
    mockPipeline.processASTM.mockRejectedValueOnce(new Error('parse fail'));
    await runMain();

    const transport = astmTransportInstances[0];
    const onMsgCall = transport.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'message',
    );
    const msgHandler = onMsgCall![1] as (frames: string[]) => void;

    msgHandler(['bad data']);
    await new Promise((r) => setTimeout(r, 50));

    expect(mockLogger.error).toHaveBeenCalledWith('ASTM pipeline error', {
      analyzerId: 'astm-1',
      error: expect.stringContaining('parse fail'),
    });
  });

  it('HL7v2 onData callback feeds bytes to MLLP transport.receive', async () => {
    await runMain();

    const hl7OnDataCall = mockConnectionManager.onData.mock.calls.find(
      (call: unknown[]) => call[0] === 'hl7-1',
    );
    expect(hl7OnDataCall).toBeDefined();
    const onDataCb = hl7OnDataCall![1] as (data: Buffer) => void;

    expect(mllpTransportInstances).toHaveLength(1);
    const transport = mllpTransportInstances[0];

    const buf = Buffer.from('MSH|data');
    onDataCb(buf);
    expect(transport.receive).toHaveBeenCalledWith(buf);
  });

  it('HL7v2 transport message callback sends raw message to pipeline.processHL7v2', async () => {
    await runMain();

    const transport = mllpTransportInstances[0];
    const onMsgCall = transport.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'message',
    );
    expect(onMsgCall).toBeDefined();
    const msgHandler = onMsgCall![1] as (rawMessage: string) => void;

    msgHandler('MSH|^~\\&|test');
    await new Promise((r) => setTimeout(r, 10));

    expect(mockPipeline.processHL7v2).toHaveBeenCalledWith('hl7-1', 'MSH|^~\\&|test');
  });

  it('HL7v2 transport message callback logs error when pipeline rejects', async () => {
    mockPipeline.processHL7v2.mockRejectedValueOnce(new Error('hl7 fail'));
    await runMain();

    const transport = mllpTransportInstances[0];
    const onMsgCall = transport.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'message',
    );
    const msgHandler = onMsgCall![1] as (rawMessage: string) => void;

    msgHandler('bad hl7');
    await new Promise((r) => setTimeout(r, 50));

    expect(mockLogger.error).toHaveBeenCalledWith('HL7v2 pipeline error', {
      analyzerId: 'hl7-1',
      error: expect.stringContaining('hl7 fail'),
    });
  });

  it('Combilyzer onData buffers until L| marker then calls pipeline.processCombilyzer', async () => {
    await runMain();

    const combiOnDataCall = mockConnectionManager.onData.mock.calls.find(
      (call: unknown[]) => call[0] === 'combi-1',
    );
    expect(combiOnDataCall).toBeDefined();
    const onDataCb = combiOnDataCall![1] as (data: Buffer) => void;

    // Send partial data — should NOT trigger pipeline yet
    onDataCb(Buffer.from('H|\\^&|||Combilyzer\nR|1|^^^GLU|Neg'));
    expect(mockPipeline.processCombilyzer).not.toHaveBeenCalled();

    // Send remaining data with L| terminator
    onDataCb(Buffer.from('ative\nL|1|N'));
    await new Promise((r) => setTimeout(r, 10));

    expect(mockPipeline.processCombilyzer).toHaveBeenCalledWith(
      'combi-1',
      'H|\\^&|||Combilyzer\nR|1|^^^GLU|Negative\nL|1|N',
    );
  });

  it('Combilyzer clears buffer after processing and handles next message', async () => {
    await runMain();

    const combiOnDataCall = mockConnectionManager.onData.mock.calls.find(
      (call: unknown[]) => call[0] === 'combi-1',
    );
    const onDataCb = combiOnDataCall![1] as (data: Buffer) => void;

    // First complete message
    onDataCb(Buffer.from('msg1\nL|1|N'));
    await new Promise((r) => setTimeout(r, 10));
    expect(mockPipeline.processCombilyzer).toHaveBeenCalledTimes(1);

    // Second complete message — buffer should have been cleared
    onDataCb(Buffer.from('msg2\nL|1|N'));
    await new Promise((r) => setTimeout(r, 10));
    expect(mockPipeline.processCombilyzer).toHaveBeenCalledTimes(2);
    expect(mockPipeline.processCombilyzer).toHaveBeenLastCalledWith('combi-1', 'msg2\nL|1|N');
  });

  it('Combilyzer logs error when pipeline.processCombilyzer rejects', async () => {
    mockPipeline.processCombilyzer.mockRejectedValueOnce(new Error('combi fail'));
    await runMain();

    const combiOnDataCall = mockConnectionManager.onData.mock.calls.find(
      (call: unknown[]) => call[0] === 'combi-1',
    );
    const onDataCb = combiOnDataCall![1] as (data: Buffer) => void;

    onDataCb(Buffer.from('data\nL|1|N'));
    await new Promise((r) => setTimeout(r, 50));

    expect(mockLogger.error).toHaveBeenCalledWith('Combilyzer pipeline error', {
      analyzerId: 'combi-1',
      error: expect.stringContaining('combi fail'),
    });
  });

  // -------------------------------------------------------------------------
  // ResultPipeline dependency wiring tests
  // -------------------------------------------------------------------------

  it('pipeline resultSender wrapper calls sendLabResult with medplum client', async () => {
    await runMain();

    // Get the deps passed to ResultPipeline constructor
    const { ResultPipeline } = await import('./pipeline/resultPipeline.js');
    const pipelineDeps = (ResultPipeline as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const senderWrapper = pipelineDeps.resultSender;

    // Call the sendLabResult wrapper
    const fakeResult = { barcode: '12345678' } as unknown;
    await senderWrapper.sendLabResult(fakeResult);

    const { sendLabResult } = await import('./fhir/resultSender.js');
    expect(sendLabResult).toHaveBeenCalledWith(mockMedplumClient, fakeResult, expect.any(Function));
  });

  it('pipeline messageLogger adapter calls MessageLogger.logMessage with full schema', async () => {
    await runMain();

    const { ResultPipeline } = await import('./pipeline/resultPipeline.js');
    const pipelineDeps = (ResultPipeline as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const loggerAdapter = pipelineDeps.messageLogger;

    // Call with a partial entry (like pipeline would)
    loggerAdapter.logMessage({
      analyzerId: 'astm-1',
      direction: 'inbound',
      protocol: 'astm',
      rawContent: 'H|test',
      status: 'success',
    });

    expect(mockMessageLogger.logMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        analyzerId: 'astm-1',
        direction: 'inbound',
        protocol: 'astm',
        rawContent: 'H|test',
        status: 'success',
        analyzerName: 'astm-1', // falls back to analyzerId when analyzerName is absent
      }),
    );
  });

  it('pipeline messageLogger adapter uses defaults when fields are missing', async () => {
    await runMain();

    const { ResultPipeline } = await import('./pipeline/resultPipeline.js');
    const pipelineDeps = (ResultPipeline as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const loggerAdapter = pipelineDeps.messageLogger;

    // Call with an empty entry — all || fallbacks should trigger
    loggerAdapter.logMessage({});

    expect(mockMessageLogger.logMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        analyzerId: '',
        analyzerName: '',
        direction: 'inbound',
        protocol: '',
        rawContent: '',
        parsedSummary: '',
        fhirResourceIds: [],
        status: 'success',
      }),
    );
    // timestamp should default to a valid ISO string
    const call = mockMessageLogger.logMessage.mock.calls[0][0];
    expect(typeof call.timestamp).toBe('string');
    expect(call.timestamp.length).toBeGreaterThan(0);
  });

  it('pipeline messageLogger adapter passes through all provided fields', async () => {
    await runMain();

    const { ResultPipeline } = await import('./pipeline/resultPipeline.js');
    const pipelineDeps = (ResultPipeline as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const loggerAdapter = pipelineDeps.messageLogger;

    // Call with ALL fields provided — no fallbacks triggered
    loggerAdapter.logMessage({
      timestamp: '2026-03-05T12:00:00Z',
      analyzerId: 'hl7-1',
      analyzerName: 'Mindray BC-3510',
      direction: 'outbound',
      protocol: 'hl7v2',
      rawContent: 'MSH|data',
      parsedSummary: 'WBC result',
      fhirResourceIds: ['Observation/obs-1'],
      status: 'error',
      errorMessage: 'Connection lost',
    });

    expect(mockMessageLogger.logMessage).toHaveBeenCalledWith({
      timestamp: '2026-03-05T12:00:00Z',
      analyzerId: 'hl7-1',
      analyzerName: 'Mindray BC-3510',
      direction: 'outbound',
      protocol: 'hl7v2',
      rawContent: 'MSH|data',
      parsedSummary: 'WBC result',
      fhirResourceIds: ['Observation/obs-1'],
      status: 'error',
      errorMessage: 'Connection lost',
    });
  });

  it('mapToFHIR wrapper calls mapLabResultToFHIR and returns flat resource array', async () => {
    // Set up fhirMapper to return specific resources
    const { mapLabResultToFHIR } = await import('./mappers/fhirMapper.js');
    const fakeObs = { resourceType: 'Observation', id: 'obs-1' };
    const fakeReport = { resourceType: 'DiagnosticReport', id: 'dr-1' };
    (mapLabResultToFHIR as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      observations: [fakeObs],
      diagnosticReport: fakeReport,
    });

    await runMain();

    // Get the mapToFHIR fn passed to sendLabResult — it's the 3rd arg
    const { sendLabResult } = await import('./fhir/resultSender.js');
    // sendLabResult is called by the pipeline's resultSender wrapper, but
    // the mapToFHIR function is passed as the 3rd argument.
    // We need to invoke the resultSender wrapper first to trigger a sendLabResult call.

    const { ResultPipeline } = await import('./pipeline/resultPipeline.js');
    const pipelineDeps = (ResultPipeline as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    await pipelineDeps.resultSender.sendLabResult({ barcode: '99999999' });

    // Now sendLabResult has been called with (client, result, mapToFHIR)
    const mapToFHIRFn = (sendLabResult as ReturnType<typeof vi.fn>).mock.calls[0][2];

    // Call mapToFHIR directly
    const fakeLabResult = { barcode: '99999999' };
    const fakeMatch = {
      specimenReference: 'Specimen/sp-1',
      serviceRequestReference: 'ServiceRequest/sr-1',
    };

    // Reset mock for this specific call
    (mapLabResultToFHIR as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      observations: [fakeObs],
      diagnosticReport: fakeReport,
    });

    const resources = mapToFHIRFn(fakeLabResult, fakeMatch);

    expect(mapLabResultToFHIR).toHaveBeenCalledWith(fakeLabResult, 'Specimen/sp-1', 'ServiceRequest/sr-1', undefined);
    expect(resources).toEqual([fakeObs, fakeReport]);
  });

  it('mapToFHIR wrapper handles undefined references', async () => {
    const { mapLabResultToFHIR } = await import('./mappers/fhirMapper.js');
    (mapLabResultToFHIR as ReturnType<typeof vi.fn>).mockReturnValue({
      observations: [],
      diagnosticReport: { resourceType: 'DiagnosticReport' },
    });

    await runMain();

    const { sendLabResult } = await import('./fhir/resultSender.js');
    const { ResultPipeline } = await import('./pipeline/resultPipeline.js');
    const pipelineDeps = (ResultPipeline as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    await pipelineDeps.resultSender.sendLabResult({ barcode: '88888888' });

    const mapToFHIRFn = (sendLabResult as ReturnType<typeof vi.fn>).mock.calls[0][2];

    // Call with empty/null references
    mapToFHIRFn({ barcode: '88888888' }, { specimenReference: null, serviceRequestReference: null, patientReference: null });

    // Should pass undefined (via || undefined) instead of null
    expect(mapLabResultToFHIR).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      undefined,
      undefined,
    );
  });

  it('health.getStatuses and status.getStatuses delegate to connectionManager', async () => {
    mockConnectionManager.getStatuses.mockReturnValue([{ id: 'test', connected: true }]);
    await runMain();

    const { createServer } = await import('./api/server.js');
    const serverDeps = (createServer as ReturnType<typeof vi.fn>).mock.calls[0][0];

    // Invoke the getStatuses closures — these are lines 173 and 178
    const healthStatuses = serverDeps.health.getStatuses();
    const statusStatuses = serverDeps.status.getStatuses();

    expect(healthStatuses).toEqual([{ id: 'test', connected: true }]);
    expect(statusStatuses).toEqual([{ id: 'test', connected: true }]);
    expect(mockConnectionManager.getStatuses).toHaveBeenCalled();
  });

  it('RetryProcessor receives the correct sender function', async () => {
    await runMain();

    const { RetryProcessor } = await import('./queue/retryProcessor.js');
    expect(RetryProcessor).toHaveBeenCalledWith(mockQueue, expect.any(Function));

    // Get the sender function passed to RetryProcessor
    const senderFn = (RetryProcessor as ReturnType<typeof vi.fn>).mock.calls[0][1];

    // Call it with a fake lab result
    const fakeResult = { barcode: '77777777' } as unknown;
    await senderFn(fakeResult);

    const { sendLabResult } = await import('./fhir/resultSender.js');
    expect(sendLabResult).toHaveBeenCalledWith(mockMedplumClient, fakeResult, expect.any(Function));
  });

  // -------------------------------------------------------------------------
  // Sprint 1-3 additions: ACK wiring, buffer limits, exception handlers
  // -------------------------------------------------------------------------

  it('ASTM transport response callback writes ACK/NAK bytes back to connection', async () => {
    await runMain();

    const transport = astmTransportInstances[0];
    // Find the on('response') handler
    const onRespCall = transport.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'response',
    );
    expect(onRespCall).toBeDefined();
    const respHandler = onRespCall![1] as (byte: number) => void;

    // Invoke with ACK byte (0x06)
    respHandler(0x06);
    expect(mockGetConnection).toHaveBeenCalledWith('astm-1');
    expect(mockWrite).toHaveBeenCalledWith(Buffer.from([0x06]));
  });

  it('HL7v2 message handler sends MLLP-framed ACK back to connection', async () => {
    await runMain();

    const transport = mllpTransportInstances[0];
    const onMsgCall = transport.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'message',
    );
    expect(onMsgCall).toBeDefined();
    const msgHandler = onMsgCall![1] as (rawMessage: string) => void;

    msgHandler('MSH|^~\\&|test');
    await new Promise((r) => setTimeout(r, 10));

    // parseORU should have been called
    const { parseORU } = await import('./protocols/hl7v2/parser.js');
    expect(parseORU).toHaveBeenCalledWith('MSH|^~\\&|test');

    // buildACK should have been called
    const { buildACK } = await import('./protocols/hl7v2/ack.js');
    expect(buildACK).toHaveBeenCalledWith(expect.objectContaining({ messageControlId: 'MSG001' }), 'AA');

    // Connection should have received MLLP-framed ACK
    expect(mockWrite).toHaveBeenCalled();
    const writtenBuf = mockWrite.mock.calls[0][0] as Buffer;
    // First byte = VT (0x0B), last two bytes = FS (0x1C) + CR (0x0D)
    expect(writtenBuf[0]).toBe(0x0b);
    expect(writtenBuf[writtenBuf.length - 2]).toBe(0x1c);
    expect(writtenBuf[writtenBuf.length - 1]).toBe(0x0d);
  });

  it('Combilyzer buffer overflow resets buffer and logs error', async () => {
    await runMain();

    const combiOnDataCall = mockConnectionManager.onData.mock.calls.find(
      (call: unknown[]) => call[0] === 'combi-1',
    );
    const onDataCb = combiOnDataCall![1] as (data: Buffer) => void;

    // Feed a chunk that exceeds 1MB
    const bigChunk = Buffer.alloc(1_048_577, 'x');
    onDataCb(bigChunk);

    // Should have logged an error about buffer overflow
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('buffer overflow'),
      expect.objectContaining({ analyzerId: 'combi-1' }),
    );

    // Pipeline should NOT have been called
    expect(mockPipeline.processCombilyzer).not.toHaveBeenCalled();

    // Buffer should be reset — sending a normal message should work
    onDataCb(Buffer.from('normal\nL|1|N'));
    await new Promise((r) => setTimeout(r, 10));
    expect(mockPipeline.processCombilyzer).toHaveBeenCalledWith('combi-1', 'normal\nL|1|N');
  });

  it('registers unhandledRejection and uncaughtException handlers', async () => {
    await runMain();

    expect(signalHandlers.has('unhandledRejection')).toBe(true);
    expect(signalHandlers.has('uncaughtException')).toBe(true);
  });

  it('unhandledRejection handler logs and exits', async () => {
    await runMain();

    const handler = signalHandlers.get('unhandledRejection');
    expect(handler).toBeDefined();
    handler!(new Error('unhandled!'));

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Unhandled promise rejection',
      expect.objectContaining({ error: expect.stringContaining('unhandled!') }),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('mapToFHIR wrapper passes patientReference from BarcodeMatch', async () => {
    const { mapLabResultToFHIR } = await import('./mappers/fhirMapper.js');
    (mapLabResultToFHIR as ReturnType<typeof vi.fn>).mockReturnValue({
      observations: [],
      diagnosticReport: { resourceType: 'DiagnosticReport' },
    });

    await runMain();

    const { sendLabResult } = await import('./fhir/resultSender.js');
    const { ResultPipeline } = await import('./pipeline/resultPipeline.js');
    const pipelineDeps = (ResultPipeline as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    await pipelineDeps.resultSender.sendLabResult({ barcode: '66666666' });

    const mapToFHIRFn = (sendLabResult as ReturnType<typeof vi.fn>).mock.calls[0][2];

    // Call with a match that has patientReference
    mapToFHIRFn({ barcode: '66666666' }, {
      specimenReference: 'Specimen/sp-1',
      serviceRequestReference: 'ServiceRequest/sr-1',
      patientReference: 'Patient/pat-1',
    });

    expect(mapLabResultToFHIR).toHaveBeenCalledWith(
      expect.anything(),
      'Specimen/sp-1',
      'ServiceRequest/sr-1',
      'Patient/pat-1',
    );
  });

  it('graceful shutdown awaits server.close before closing databases', async () => {
    // Track call order
    const callOrder: string[] = [];
    mockServerClose.mockImplementation((cb?: () => void) => {
      callOrder.push('server.close');
      if (cb) cb();
    });
    mockQueue.close.mockImplementation(() => callOrder.push('queue.close'));
    mockMessageLogger.close.mockImplementation(() => callOrder.push('messageLogger.close'));

    await runMain();

    const handler = signalHandlers.get('SIGINT');
    await handler!();
    await new Promise((r) => setTimeout(r, 50));

    expect(callOrder.indexOf('server.close')).toBeLessThan(callOrder.indexOf('queue.close'));
    expect(callOrder.indexOf('server.close')).toBeLessThan(callOrder.indexOf('messageLogger.close'));
  });
});
