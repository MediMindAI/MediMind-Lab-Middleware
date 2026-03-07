/**
 * Analyzer configuration types.
 * These define how each physical lab machine connects to the middleware.
 */

/** Supported communication protocols */
export type AnalyzerProtocol = 'astm' | 'hl7v2' | 'siemens-lis3' | 'combilyzer';

/** Supported connection types */
export type ConnectionType = 'serial' | 'tcp' | 'tcp-server';

/** Serial port configuration */
export interface SerialConfig {
  connection: 'serial';
  port: string; // e.g., "COM3" on Windows, "/dev/ttyUSB0" on Linux
  baudRate: number;
  dataBits: 7 | 8;
  parity: 'none' | 'even' | 'odd';
  stopBits: 1 | 2;
}

/** TCP/IP connection configuration (client mode — we connect TO the analyzer) */
export interface TcpConfig {
  connection: 'tcp';
  host: string;
  tcpPort: number;
}

/** TCP server configuration (server mode — the analyzer connects TO us) */
export interface TcpServerConfig {
  connection: 'tcp-server';
  listenPort: number;
  listenHost?: string;
}

/** Base analyzer configuration */
interface AnalyzerBase {
  id: string;
  name: string;
  protocol: AnalyzerProtocol;
  enabled: boolean;
  _comment?: string;
}

/** Analyzer with serial connection */
export interface SerialAnalyzer extends AnalyzerBase, SerialConfig {}

/** Analyzer with TCP connection */
export interface TcpAnalyzer extends AnalyzerBase, TcpConfig {}

/** Analyzer with TCP server connection (analyzer dials in to us) */
export interface TcpServerAnalyzer extends AnalyzerBase, TcpServerConfig {}

/** Any analyzer configuration */
export type AnalyzerConfig = SerialAnalyzer | TcpAnalyzer | TcpServerAnalyzer;

/** Connection status for monitoring */
export interface AnalyzerStatus {
  id: string;
  name: string;
  protocol: AnalyzerProtocol;
  connected: boolean;
  lastMessageTime: string | null;
  lastErrorTime: string | null;
  lastError: string | null;
  messagesReceived: number;
  errorsCount: number;
  upSince: string | null;
}

/** Full application configuration */
export interface AppConfig {
  analyzers: AnalyzerConfig[];
  medplum: {
    baseUrl: string;
    projectId: string;
    clientId: string;
    clientSecret: string;
  };
  api: {
    port: number;
    host: string;
    apiKey?: string;
    corsOrigin?: string;
  };
  queue: {
    dbPath: string;
    retryIntervalMs: number;
    maxRetries: number;
  };
  logging: {
    level: string;
    dir: string;
    maxFiles: number;
    maxSizeMb: number;
  };
}
