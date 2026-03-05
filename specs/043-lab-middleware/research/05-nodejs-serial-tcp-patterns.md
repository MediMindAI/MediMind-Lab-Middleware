# Research: Node.js Serial Port, TCP, and Infrastructure Patterns

> **Purpose:** Reference document for implementing the MediMind Lab Middleware —
> covers every library and pattern we need for serial communication, TCP sockets,
> offline queuing, Windows service deployment, and long-running process management.
>
> **Last updated:** 2026-03-05

---

## Table of Contents

1. [serialport npm Library (v12+)](#1-serialport-npm-library-v12)
2. [TCP Socket Management (net module)](#2-tcp-socket-management-net-module)
3. [Managing Multiple Concurrent Connections](#3-managing-multiple-concurrent-connections)
4. [Auto-Reconnection Patterns](#4-auto-reconnection-patterns)
5. [Windows Service with node-windows](#5-windows-service-with-node-windows)
6. [SQLite Queue with better-sqlite3](#6-sqlite-queue-with-better-sqlite3)
7. [Error Handling Patterns](#7-error-handling-patterns)
8. [Performance Considerations](#8-performance-considerations)

---

## 1. serialport npm Library (v12+)

The `serialport` package (v12+) is the standard Node.js library for RS-232
serial communication. Think of it as a "USB cable driver" — it lets your
Node.js code talk to physical devices (lab analyzers) plugged into COM ports.

**Package:** `serialport` (v12.0.0+ / latest is 13.x)
**TypeScript:** Built-in type declarations (no `@types/serialport` needed for v12+)
**Import style:** ESM (`import { SerialPort } from 'serialport'`)

### 1.1 Opening a Serial Port

When you open a serial port you tell it which COM port, how fast to talk
(baud rate), and the data format. This must match the analyzer's settings
exactly — like tuning to the same radio frequency.

```typescript
import { SerialPort } from 'serialport';

// Open a serial port with configuration matching the analyzer
const port = new SerialPort({
  path: 'COM3',              // Windows COM port name
  baudRate: 9600,            // Must match analyzer setting
  dataBits: 8,               // 7 or 8, check analyzer manual
  parity: 'none',            // 'none' | 'even' | 'odd'
  stopBits: 1,               // 1 or 2
  autoOpen: true,            // Opens immediately (default: true)
});

port.on('open', () => {
  console.log('Port opened successfully');
});

port.on('error', (err) => {
  console.error('Port error:', err.message);
});
```

**Using `autoOpen: false`** — Preferred for our middleware so we control
when the connection starts:

```typescript
const port = new SerialPort({
  path: 'COM3',
  baudRate: 9600,
  dataBits: 8,
  parity: 'none',
  stopBits: 1,
  autoOpen: false,  // We'll open it ourselves
});

// Open manually — returns a callback, or use promisify
port.open((err) => {
  if (err) {
    console.error('Failed to open port:', err.message);
    return;
  }
  console.log('Port opened');
});
```

**Promise wrapper** for cleaner async/await code:

```typescript
function openPort(port: SerialPort): Promise<void> {
  return new Promise((resolve, reject) => {
    port.open((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

// Usage
try {
  await openPort(port);
  console.log('Port ready');
} catch (err) {
  console.error('Could not open port:', err);
}
```

### 1.2 Listing Available Serial Ports

Before connecting, you can discover which COM ports are plugged in.
This is useful for diagnostics and auto-detection.

```typescript
import { SerialPort } from 'serialport';

// List all available serial ports
const ports = await SerialPort.list();

for (const portInfo of ports) {
  console.log(`  Path: ${portInfo.path}`);           // "COM3"
  console.log(`  Manufacturer: ${portInfo.manufacturer}`);
  console.log(`  Serial Number: ${portInfo.serialNumber}`);
  console.log(`  PnP ID: ${portInfo.pnpId}`);
  console.log(`  Vendor ID: ${portInfo.vendorId}`);
  console.log(`  Product ID: ${portInfo.productId}`);
  console.log('---');
}

// Example output on Windows:
// Path: COM3
// Manufacturer: FTDI
// Serial Number: A50285BI
// Vendor ID: 0403
// Product ID: 6001
```

**Windows-specific notes:**
- Physical RS-232 ports show up as `COM1`, `COM2`, etc.
- USB-to-serial adapters (FTDI, Prolific, CH340) show up as higher COM numbers
- COM port numbers can change if the adapter is plugged into a different USB slot
- Use `vendorId` + `productId` to identify a specific adapter regardless of COM number

### 1.3 Event-Based Reading

SerialPort emits events when things happen. This is how we listen for
data from lab analyzers — the analyzer sends bytes whenever it has results.

```typescript
// 'open' — Port successfully opened
port.on('open', () => {
  console.log('Connection established');
});

// 'data' — Raw bytes received from the analyzer
// This is the most important event — it fires every time bytes arrive.
// IMPORTANT: You may get partial messages! A single ASTM frame could
// arrive as 3 separate 'data' events. Use a parser (see 1.4).
port.on('data', (buffer: Buffer) => {
  console.log('Raw bytes:', buffer);
  console.log('As hex:', buffer.toString('hex'));
  console.log('Byte count:', buffer.length);
});

// 'close' — Port was closed
// On disconnect, err.disconnected === true
port.on('close', (err?: Error & { disconnected?: boolean }) => {
  if (err?.disconnected) {
    console.log('Device was physically unplugged!');
  } else {
    console.log('Port closed normally');
  }
});

// 'error' — Something went wrong
port.on('error', (err: Error) => {
  console.error('Serial error:', err.message);
});

// 'drain' — Safe to write again after a write returned false
port.on('drain', () => {
  console.log('Write buffer drained, safe to write more');
});
```

### 1.4 Parsers — Handling Partial Reads

Raw serial data arrives in unpredictable chunks. A parser sits between
the serial port and your code, assembling chunks into complete messages.
Think of it as a "message assembler."

**Available parsers in v12+:**

| Parser | What it does | Best for |
|--------|-------------|----------|
| `InterByteTimeoutParser` | Emits data after a silence gap | **ASTM protocol** (our primary use) |
| `DelimiterParser` | Splits on a delimiter byte/string | HL7v2 (split on `\x0B` and `\x1C`) |
| `ByteLengthParser` | Emits fixed-size chunks | Fixed-length protocols |
| `ReadyParser` | Waits for a "ready" sequence, then emits | Device initialization |
| `ReadlineParser` | Splits on line endings | Text-based protocols |
| `RegexParser` | Splits on regex match | Complex delimiters |

#### InterByteTimeoutParser — Best for ASTM

ASTM frames are variable-length and end with specific bytes (ETX/ETB + checksum + CR LF).
The `InterByteTimeoutParser` works by collecting bytes until there is a pause
(silence) between bytes. If no new byte arrives within the interval, it emits
everything it collected as one chunk.

**Why this is best for ASTM:** Lab analyzers send an ASTM frame as a burst
of bytes, then pause before sending the next frame. The inter-byte timeout
catches each burst as a complete unit.

```typescript
import { SerialPort } from 'serialport';
import { InterByteTimeoutParser } from '@serialport/parser-inter-byte-timeout';

const port = new SerialPort({
  path: 'COM3',
  baudRate: 9600,
  autoOpen: false,
});

// 100ms timeout — if no byte arrives within 100ms, emit what we have.
// ASTM at 9600 baud: each byte takes ~1ms, so 100ms gap means "frame is done."
// Tune this value based on analyzer behavior (30-200ms typical).
const parser = port.pipe(new InterByteTimeoutParser({ interval: 100 }));

parser.on('data', (buffer: Buffer) => {
  // Now we get complete ASTM frames (or control bytes) as single events
  const firstByte = buffer[0];

  if (firstByte === 0x05) {
    console.log('Received ENQ — analyzer wants to send data');
  } else if (firstByte === 0x04) {
    console.log('Received EOT — analyzer finished sending');
  } else if (firstByte === 0x02) {
    console.log('Received data frame:', buffer.toString('ascii'));
  }
});
```

#### DelimiterParser — For HL7v2 Messages

HL7v2 messages are wrapped in MLLP (Minimum Lower Layer Protocol) framing:
start with `0x0B`, end with `0x1C 0x0D`.

```typescript
import { DelimiterParser } from '@serialport/parser-delimiter';

// Split on the HL7v2 MLLP end-of-message bytes
const hl7Parser = port.pipe(new DelimiterParser({
  delimiter: Buffer.from([0x1C, 0x0D]),  // FS + CR = end of HL7 message
  includeDelimiter: false,
}));

hl7Parser.on('data', (buffer: Buffer) => {
  // Strip the leading 0x0B (VT) start byte
  const message = buffer.subarray(buffer[0] === 0x0B ? 1 : 0);
  console.log('Complete HL7v2 message:', message.toString('ascii'));
});
```

#### ByteLengthParser — For Fixed-Size Chunks

```typescript
import { ByteLengthParser } from '@serialport/parser-byte-length';

const fixedParser = port.pipe(new ByteLengthParser({ length: 64 }));

fixedParser.on('data', (buffer: Buffer) => {
  console.log('Got exactly 64 bytes:', buffer);
});
```

#### ReadyParser — For Devices That Send a Ready Signal

```typescript
import { ReadyParser } from '@serialport/parser-ready';

const readyParser = port.pipe(new ReadyParser({
  delimiter: 'READY',
}));

readyParser.on('ready', () => {
  console.log('Device is ready — start communication');
});

readyParser.on('data', (buffer: Buffer) => {
  console.log('Data after ready signal:', buffer);
});
```

### 1.5 Writing Data — Sending ACK/NAK Bytes

In ASTM, the middleware must respond to the analyzer with control bytes:
- Send ACK (`0x06`) to say "got it, send next frame"
- Send NAK (`0x15`) to say "bad checksum, send again"

```typescript
// Write raw bytes to the serial port
function sendByte(port: SerialPort, byte: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const buffer = Buffer.from([byte]);
    port.write(buffer, (writeErr) => {
      if (writeErr) return reject(writeErr);
      // Flush ensures the byte is physically sent out the wire
      port.drain((drainErr) => {
        if (drainErr) return reject(drainErr);
        resolve();
      });
    });
  });
}

// ASTM control byte constants
const ACK = 0x06;
const NAK = 0x15;
const ENQ = 0x05;
const EOT = 0x04;

// Usage in ASTM flow:
// Analyzer sends ENQ → we send ACK
await sendByte(port, ACK);

// Analyzer sends data frame → we verify checksum → send ACK or NAK
const checksumValid = verifyChecksum(frame);
await sendByte(port, checksumValid ? ACK : NAK);

// Writing multi-byte data (e.g., sending a query to the analyzer)
function sendData(port: SerialPort, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    port.write(data, (writeErr) => {
      if (writeErr) return reject(writeErr);
      port.drain((drainErr) => {
        if (drainErr) return reject(drainErr);
        resolve();
      });
    });
  });
}
```

### 1.6 Handling Port Disconnection and Reconnection

USB-to-serial adapters can be unplugged, cables can come loose. The
middleware must detect this and try to reconnect.

```typescript
import { SerialPort } from 'serialport';

class SerialConnection {
  private port: SerialPort | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isClosing = false;

  constructor(
    private config: { path: string; baudRate: number },
    private onData: (buffer: Buffer) => void,
  ) {}

  async connect(): Promise<void> {
    this.isClosing = false;
    this.clearReconnectTimer();

    this.port = new SerialPort({
      path: this.config.path,
      baudRate: this.config.baudRate,
      autoOpen: false,
    });

    this.port.on('data', this.onData);

    this.port.on('close', (err?: Error & { disconnected?: boolean }) => {
      if (this.isClosing) return; // Intentional close, don't reconnect

      if (err?.disconnected) {
        console.warn(`${this.config.path} disconnected — will retry`);
      }
      this.scheduleReconnect();
    });

    this.port.on('error', (err: Error) => {
      console.error(`${this.config.path} error: ${err.message}`);
      // Error on its own doesn't always close the port.
      // If the port is no longer usable, the close event will fire.
    });

    return new Promise((resolve, reject) => {
      this.port!.open((err) => {
        if (err) {
          console.error(`Failed to open ${this.config.path}: ${err.message}`);
          this.scheduleReconnect();
          reject(err);
        } else {
          console.log(`${this.config.path} opened successfully`);
          resolve();
        }
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.isClosing) return;
    this.clearReconnectTimer();
    // Try again in 5 seconds
    this.reconnectTimer = setTimeout(() => {
      console.log(`Attempting reconnect to ${this.config.path}...`);
      this.connect().catch(() => {
        // connect() already schedules another reconnect on failure
      });
    }, 5000);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  async close(): Promise<void> {
    this.isClosing = true;
    this.clearReconnectTimer();
    if (this.port?.isOpen) {
      return new Promise((resolve) => {
        this.port!.close(() => resolve());
      });
    }
  }

  write(data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.port?.isOpen) {
        return reject(new Error('Port is not open'));
      }
      this.port.write(data, (writeErr) => {
        if (writeErr) return reject(writeErr);
        this.port!.drain((drainErr) => {
          if (drainErr) return reject(drainErr);
          resolve();
        });
      });
    });
  }

  get isOpen(): boolean {
    return this.port?.isOpen ?? false;
  }
}
```

### 1.7 Windows-Specific Considerations

| Topic | Details |
|-------|---------|
| **COM port naming** | Windows uses `COM1`, `COM2`, ... `COM256`. Ports above `COM9` need the `\\.\COM10` prefix in some tools, but serialport handles this automatically. |
| **USB-to-serial adapters** | FTDI, Prolific PL2303, CH340 chips are common. Each has a Windows driver. COM port number is assigned by Windows and can change between USB slots. |
| **Port locking** | On Windows, `lock: true` (the default) prevents other processes from using the same COM port. This is required — two processes cannot share a COM port. |
| **Permissions** | Running as a Windows Service with LocalSystem account has full access to COM ports. Running as a regular user also works but requires the user to be logged in. |
| **Driver issues** | Prolific PL2303 clones often have driver issues on Windows 10/11. FTDI chips are more reliable. CH340 needs a separate driver download. |
| **Disconnect detection** | On Windows, the `close` event may NOT fire reliably when a USB-to-serial adapter is unplugged. Use polling with `SerialPort.list()` as a backup detection method. |

### 1.8 Buffer Management — Handling Partial Reads

Serial data arrives as raw `Buffer` objects. Important rules:

```typescript
// RULE 1: Never assume a 'data' event contains a complete message.
// A single ASTM frame might arrive as multiple chunks.
port.on('data', (buffer: Buffer) => {
  // buffer could be 1 byte, or 200 bytes — you don't control it.
  // Always use a parser (see section 1.4) or accumulate manually.
});

// RULE 2: If you must accumulate manually:
let incomingBuffer = Buffer.alloc(0);

port.on('data', (chunk: Buffer) => {
  incomingBuffer = Buffer.concat([incomingBuffer, chunk]);

  // Check if we have a complete message
  // For ASTM: look for CR LF at the end of a frame
  while (hasCompleteFrame(incomingBuffer)) {
    const frame = extractFrame(incomingBuffer);
    incomingBuffer = incomingBuffer.subarray(frame.length);
    processFrame(frame);
  }

  // Safety: prevent buffer from growing forever if data is garbage
  if (incomingBuffer.length > 10_000) {
    console.warn('Buffer overflow — discarding accumulated data');
    incomingBuffer = Buffer.alloc(0);
  }
});

// RULE 3: Use Buffer methods correctly
const byte = buffer[0];                    // Read single byte
const slice = buffer.subarray(1, 5);       // Non-copying slice
const copy = Buffer.from(buffer);          // Full copy
const hex = buffer.toString('hex');        // "05060a0d"
const ascii = buffer.toString('ascii');    // Human-readable (if applicable)
```

---

## 2. TCP Socket Management (net module)

Some analyzers connect over TCP/IP instead of (or in addition to) serial.
The Node.js `net` module provides low-level TCP functionality — no npm
package needed.

Two patterns exist:
- **TCP Server** — The middleware listens; the analyzer connects TO us.
- **TCP Client** — The middleware connects TO the analyzer.

### 2.1 TCP Server — Analyzers Connect to Us

Some analyzers (like Mindray BC-3510 in TCP mode, or Sysmex XN-550 via
Ethernet) are configured to connect to a specific IP:port. Our middleware
listens on that port.

```typescript
import net from 'node:net';

interface TcpServerOptions {
  port: number;
  host?: string;   // Default '0.0.0.0' = all interfaces
  onData: (data: Buffer, socket: net.Socket) => void;
  onConnection: (socket: net.Socket) => void;
  onDisconnect: (socket: net.Socket) => void;
}

function createTcpServer(options: TcpServerOptions): net.Server {
  const server = net.createServer((socket) => {
    const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`Analyzer connected from ${remoteAddr}`);

    // Keep-alive: detect dead connections
    socket.setKeepAlive(true, 30_000); // Probe every 30 seconds

    // Timeout: close if no data for 5 minutes
    socket.setTimeout(300_000);

    options.onConnection(socket);

    socket.on('data', (data: Buffer) => {
      options.onData(data, socket);
    });

    socket.on('close', (hadError: boolean) => {
      console.log(`${remoteAddr} disconnected (error: ${hadError})`);
      options.onDisconnect(socket);
    });

    socket.on('error', (err: Error) => {
      console.error(`${remoteAddr} socket error: ${err.message}`);
    });

    socket.on('timeout', () => {
      console.warn(`${remoteAddr} timed out — closing`);
      socket.end();
    });
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${options.port} is already in use!`);
    } else {
      console.error(`Server error: ${err.message}`);
    }
  });

  server.listen(options.port, options.host ?? '0.0.0.0', () => {
    console.log(`TCP server listening on port ${options.port}`);
  });

  return server;
}

// Usage:
const server = createTcpServer({
  port: 5000,
  onData: (data, socket) => {
    console.log('Received:', data.toString('hex'));
    // Send ACK back to the analyzer
    socket.write(Buffer.from([0x06]));
  },
  onConnection: (socket) => {
    console.log('New analyzer connection');
  },
  onDisconnect: (socket) => {
    console.log('Analyzer disconnected');
  },
});
```

### 2.2 TCP Client — We Connect to the Analyzer

Some analyzers act as TCP servers themselves. The middleware connects
to them as a client.

```typescript
import net from 'node:net';

interface TcpClientOptions {
  host: string;
  port: number;
  onData: (data: Buffer) => void;
  onConnect: () => void;
  onClose: () => void;
}

function createTcpClient(options: TcpClientOptions): net.Socket {
  const socket = new net.Socket();

  // Keep-alive to detect broken connections
  socket.setKeepAlive(true, 30_000);

  socket.connect(options.port, options.host, () => {
    console.log(`Connected to ${options.host}:${options.port}`);
    options.onConnect();
  });

  socket.on('data', (data: Buffer) => {
    options.onData(data);
  });

  socket.on('close', (hadError: boolean) => {
    console.log(`Disconnected from ${options.host}:${options.port}`);
    options.onClose();
  });

  socket.on('error', (err: Error) => {
    console.error(`TCP client error: ${err.message}`);
  });

  // Timeout if no data for a while
  socket.setTimeout(300_000);
  socket.on('timeout', () => {
    console.warn('Socket timed out');
    socket.end();
  });

  return socket;
}

// Writing data to a TCP socket
function tcpWrite(socket: net.Socket, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const success = socket.write(data, (err) => {
      if (err) return reject(err);
      resolve();
    });
    // If write() returns false, the internal buffer is full.
    // Wait for 'drain' before writing more.
    if (!success) {
      socket.once('drain', () => resolve());
    }
  });
}
```

### 2.3 Buffer Management for TCP Streams

TCP is a stream protocol — there are no "message boundaries." Data from
multiple messages can arrive in one chunk, or one message can arrive as
many chunks. You must frame the data yourself.

```typescript
/**
 * TCP framing for ASTM over TCP.
 *
 * ASTM over TCP uses the same framing as serial:
 * ENQ → ACK → STX...ETX<checksum>CRLF → ACK → ... → EOT
 *
 * We use the same InterByteTimeout approach but on a TCP socket.
 */
class TcpFrameAccumulator {
  private buffer = Buffer.alloc(0);
  private timer: NodeJS.Timeout | null = null;
  private intervalMs: number;
  private onFrame: (frame: Buffer) => void;

  constructor(intervalMs: number, onFrame: (frame: Buffer) => void) {
    this.intervalMs = intervalMs;
    this.onFrame = onFrame;
  }

  /** Feed raw TCP data into the accumulator */
  feed(data: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, data]);
    this.resetTimer();
  }

  private resetTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.buffer.length > 0) {
        this.onFrame(this.buffer);
        this.buffer = Buffer.alloc(0);
      }
    }, this.intervalMs);
  }

  destroy(): void {
    if (this.timer) clearTimeout(this.timer);
    this.buffer = Buffer.alloc(0);
  }
}

// Usage with a TCP socket:
const accumulator = new TcpFrameAccumulator(100, (frame) => {
  console.log('Complete frame received:', frame.toString('hex'));
  processASTMFrame(frame);
});

socket.on('data', (data) => accumulator.feed(data));
socket.on('close', () => accumulator.destroy());
```

### 2.4 Keep-Alive Settings

TCP keep-alive sends periodic probes on idle connections to detect if
the remote side has silently died (e.g., analyzer power loss, network cable pulled).

```typescript
// Enable keep-alive with a 30-second probe interval
socket.setKeepAlive(true, 30_000);

// For more control on Linux/macOS (not available on Windows via Node.js):
// socket.setKeepAlive(true, initialDelay)
// The OS controls the probe count and interval after the initial delay.

// On Windows, the default is:
// - Keep-alive time: 2 hours (much too long for us)
// - Keep-alive interval: 1 second (between probes)
// - Probe count: 10
// Setting setKeepAlive(true, 30000) changes the initial delay to 30s,
// but the OS still controls the probe interval and count.

// RECOMMENDATION: Use application-level heartbeats alongside TCP keep-alive.
// Send a periodic "ping" at the application layer (every 60 seconds)
// and expect a "pong" back within a timeout.
```

---

## 3. Managing Multiple Concurrent Connections

The middleware talks to 10+ analyzers simultaneously. We need a central
manager that creates, monitors, and routes data for all connections.
Think of it as a "switchboard operator" — it knows who is connected,
routes messages to the right handler, and alerts when a line goes down.

### 3.1 Connection Manager Design Pattern

```typescript
import { EventEmitter } from 'node:events';
import { SerialPort } from 'serialport';
import { InterByteTimeoutParser } from '@serialport/parser-inter-byte-timeout';
import net from 'node:net';

// Type-safe events using a custom interface
interface ConnectionEvents {
  data: (analyzerId: string, data: Buffer) => void;
  connected: (analyzerId: string) => void;
  disconnected: (analyzerId: string, reason: string) => void;
  error: (analyzerId: string, error: Error) => void;
}

// Extend EventEmitter with typed events
interface TypedEmitter {
  on<K extends keyof ConnectionEvents>(event: K, listener: ConnectionEvents[K]): this;
  emit<K extends keyof ConnectionEvents>(event: K, ...args: Parameters<ConnectionEvents[K]>): boolean;
  off<K extends keyof ConnectionEvents>(event: K, listener: ConnectionEvents[K]): this;
}

interface ManagedConnection {
  analyzerId: string;
  analyzerName: string;
  type: 'serial' | 'tcp';
  connected: boolean;
  port?: SerialPort;
  socket?: net.Socket;
  parser?: InterByteTimeoutParser;
  lastDataTime: Date | null;
  reconnectAttempts: number;
  reconnectTimer?: NodeJS.Timeout;
}

class ConnectionManager extends EventEmitter implements TypedEmitter {
  private connections = new Map<string, ManagedConnection>();

  /** Add a serial connection for an analyzer */
  addSerial(config: {
    analyzerId: string;
    analyzerName: string;
    path: string;
    baudRate: number;
    dataBits?: 7 | 8;
    parity?: 'none' | 'even' | 'odd';
    stopBits?: 1 | 2;
  }): void {
    const port = new SerialPort({
      path: config.path,
      baudRate: config.baudRate,
      dataBits: config.dataBits ?? 8,
      parity: config.parity ?? 'none',
      stopBits: config.stopBits ?? 1,
      autoOpen: false,
    });

    // Use InterByteTimeoutParser for ASTM framing
    const parser = port.pipe(new InterByteTimeoutParser({ interval: 100 }));

    const conn: ManagedConnection = {
      analyzerId: config.analyzerId,
      analyzerName: config.analyzerName,
      type: 'serial',
      connected: false,
      port,
      parser,
      lastDataTime: null,
      reconnectAttempts: 0,
    };

    // Wire up events
    port.on('open', () => {
      conn.connected = true;
      conn.reconnectAttempts = 0;
      this.emit('connected', config.analyzerId);
    });

    parser.on('data', (data: Buffer) => {
      conn.lastDataTime = new Date();
      this.emit('data', config.analyzerId, data);
    });

    port.on('close', () => {
      conn.connected = false;
      this.emit('disconnected', config.analyzerId, 'Port closed');
      this.scheduleReconnect(config.analyzerId);
    });

    port.on('error', (err: Error) => {
      this.emit('error', config.analyzerId, err);
    });

    this.connections.set(config.analyzerId, conn);
  }

  /** Add a TCP connection for an analyzer */
  addTcp(config: {
    analyzerId: string;
    analyzerName: string;
    host: string;
    tcpPort: number;
  }): void {
    const conn: ManagedConnection = {
      analyzerId: config.analyzerId,
      analyzerName: config.analyzerName,
      type: 'tcp',
      connected: false,
      lastDataTime: null,
      reconnectAttempts: 0,
    };

    this.connections.set(config.analyzerId, conn);
    this.connectTcp(config.analyzerId, config.host, config.tcpPort);
  }

  private connectTcp(analyzerId: string, host: string, tcpPort: number): void {
    const conn = this.connections.get(analyzerId);
    if (!conn) return;

    const socket = new net.Socket();
    conn.socket = socket;

    socket.setKeepAlive(true, 30_000);

    socket.connect(tcpPort, host, () => {
      conn.connected = true;
      conn.reconnectAttempts = 0;
      this.emit('connected', analyzerId);
    });

    socket.on('data', (data: Buffer) => {
      conn.lastDataTime = new Date();
      this.emit('data', analyzerId, data);
    });

    socket.on('close', () => {
      conn.connected = false;
      this.emit('disconnected', analyzerId, 'Socket closed');
      this.scheduleReconnect(analyzerId);
    });

    socket.on('error', (err: Error) => {
      this.emit('error', analyzerId, err);
    });
  }

  /** Open all registered connections */
  async connectAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const [id, conn] of this.connections) {
      if (conn.type === 'serial' && conn.port) {
        const p = new Promise<void>((resolve) => {
          conn.port!.open((err) => {
            if (err) {
              console.error(`Failed to open ${id}: ${err.message}`);
              this.scheduleReconnect(id);
            }
            resolve(); // Don't reject — one failure shouldn't stop others
          });
        });
        promises.push(p);
      }
      // TCP connections are already initiated in addTcp()
    }

    await Promise.all(promises);
  }

  /** Write data to a specific analyzer */
  write(analyzerId: string, data: Buffer): Promise<void> {
    const conn = this.connections.get(analyzerId);
    if (!conn) throw new Error(`Unknown analyzer: ${analyzerId}`);
    if (!conn.connected) throw new Error(`${analyzerId} is not connected`);

    return new Promise((resolve, reject) => {
      if (conn.type === 'serial' && conn.port) {
        conn.port.write(data, (writeErr) => {
          if (writeErr) return reject(writeErr);
          conn.port!.drain((drainErr) => {
            if (drainErr) return reject(drainErr);
            resolve();
          });
        });
      } else if (conn.type === 'tcp' && conn.socket) {
        conn.socket.write(data, (err) => {
          if (err) return reject(err);
          resolve();
        });
      } else {
        reject(new Error(`No active connection for ${analyzerId}`));
      }
    });
  }

  /** Get status of all connections (for the /status API) */
  getStatuses(): Array<{
    analyzerId: string;
    analyzerName: string;
    type: string;
    connected: boolean;
    lastDataTime: string | null;
  }> {
    return Array.from(this.connections.values()).map((conn) => ({
      analyzerId: conn.analyzerId,
      analyzerName: conn.analyzerName,
      type: conn.type,
      connected: conn.connected,
      lastDataTime: conn.lastDataTime?.toISOString() ?? null,
    }));
  }

  /** Gracefully close all connections */
  async closeAll(): Promise<void> {
    for (const [, conn] of this.connections) {
      if (conn.reconnectTimer) clearTimeout(conn.reconnectTimer);

      if (conn.type === 'serial' && conn.port?.isOpen) {
        await new Promise<void>((resolve) => {
          conn.port!.close(() => resolve());
        });
      } else if (conn.type === 'tcp' && conn.socket) {
        conn.socket.destroy();
      }
    }
    this.connections.clear();
  }

  private scheduleReconnect(analyzerId: string): void {
    // See Section 4 for full exponential backoff implementation
    const conn = this.connections.get(analyzerId);
    if (!conn) return;

    const delay = Math.min(1000 * Math.pow(2, conn.reconnectAttempts), 60_000);
    conn.reconnectAttempts++;

    conn.reconnectTimer = setTimeout(() => {
      if (conn.type === 'serial' && conn.port) {
        conn.port.open((err) => {
          if (err) this.scheduleReconnect(analyzerId);
        });
      } else if (conn.type === 'tcp') {
        // Need to recreate the socket for TCP
        const config = conn; // Pull host/port from original config
        // Re-attempt TCP connection...
      }
    }, delay);
  }
}
```

### 3.2 Routing Data to Protocol Handlers

Each analyzer speaks a different protocol. The connection manager emits
generic `data` events; a router sends each to the correct protocol parser.

```typescript
// Protocol handler interface — each protocol implements this
interface ProtocolHandler {
  handleData(analyzerId: string, data: Buffer): void;
  handleConnect(analyzerId: string): void;
  handleDisconnect(analyzerId: string): void;
}

// Router that maps analyzer IDs to protocol handlers
class ProtocolRouter {
  private handlers = new Map<string, ProtocolHandler>();

  register(analyzerId: string, handler: ProtocolHandler): void {
    this.handlers.set(analyzerId, handler);
  }

  setup(connectionManager: ConnectionManager): void {
    connectionManager.on('data', (analyzerId, data) => {
      const handler = this.handlers.get(analyzerId);
      if (handler) {
        handler.handleData(analyzerId, data);
      } else {
        console.warn(`No handler registered for analyzer ${analyzerId}`);
      }
    });

    connectionManager.on('connected', (analyzerId) => {
      this.handlers.get(analyzerId)?.handleConnect(analyzerId);
    });

    connectionManager.on('disconnected', (analyzerId) => {
      this.handlers.get(analyzerId)?.handleDisconnect(analyzerId);
    });
  }
}

// Wiring it all together:
const manager = new ConnectionManager();
const router = new ProtocolRouter();

// Register each analyzer with its protocol handler
router.register('sysmex-xn550', new ASTMHandler());
router.register('roche-cobas-c111', new ASTMHandler());
router.register('mindray-bc3510', new HL7v2Handler());
router.register('rapidpoint-500e', new SiemensLIS3Handler());

// Start listening
router.setup(manager);
await manager.connectAll();
```

---

## 4. Auto-Reconnection Patterns

When a cable is unplugged or an analyzer reboots, the middleware must
keep trying to reconnect. We use "exponential backoff" — wait a little
at first, then wait longer each time, up to a maximum. This prevents
hammering a down device with connection attempts.

### 4.1 Exponential Backoff Implementation

```typescript
interface ReconnectConfig {
  /** Starting delay in ms (default: 1000 = 1 second) */
  initialDelayMs: number;
  /** Maximum delay in ms (default: 60000 = 1 minute) */
  maxDelayMs: number;
  /** Multiplier per attempt (default: 2 = double each time) */
  multiplier: number;
  /** Random jitter factor 0-1 (default: 0.1 = +/- 10%) */
  jitter: number;
  /** Maximum attempts before giving up (default: Infinity = never give up) */
  maxAttempts: number;
}

const DEFAULT_RECONNECT: ReconnectConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 60_000,
  multiplier: 2,
  jitter: 0.1,
  maxAttempts: Infinity,
};

class ReconnectScheduler {
  private attempt = 0;
  private timer: NodeJS.Timeout | null = null;
  private config: ReconnectConfig;

  constructor(config: Partial<ReconnectConfig> = {}) {
    this.config = { ...DEFAULT_RECONNECT, ...config };
  }

  /**
   * Schedule the next reconnection attempt.
   * Returns the delay that was used, or null if max attempts exceeded.
   */
  schedule(onReconnect: () => void): number | null {
    if (this.attempt >= this.config.maxAttempts) {
      console.error('Max reconnection attempts reached — giving up');
      return null;
    }

    // Calculate delay with exponential backoff
    const baseDelay = Math.min(
      this.config.initialDelayMs * Math.pow(this.config.multiplier, this.attempt),
      this.config.maxDelayMs,
    );

    // Add jitter to prevent all analyzers reconnecting at exactly the same time
    const jitter = baseDelay * this.config.jitter * (Math.random() * 2 - 1);
    const delay = Math.max(0, Math.round(baseDelay + jitter));

    this.attempt++;

    console.log(
      `Reconnect attempt ${this.attempt} in ${delay}ms ` +
      `(base: ${baseDelay}ms)`
    );

    this.timer = setTimeout(onReconnect, delay);
    return delay;
  }

  /** Reset attempt counter (call after successful connection) */
  reset(): void {
    this.attempt = 0;
    this.cancel();
  }

  /** Cancel any pending reconnect */
  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
```

**Backoff progression example (multiplier=2, initial=1s, max=60s):**

| Attempt | Delay (approx) |
|---------|----------------|
| 1 | 1 second |
| 2 | 2 seconds |
| 3 | 4 seconds |
| 4 | 8 seconds |
| 5 | 16 seconds |
| 6 | 32 seconds |
| 7+ | 60 seconds (capped) |

### 4.2 Serial Port Reconnection — Detecting Port Availability

On Windows, unplugging a USB-to-serial adapter does not always fire
the `close` event reliably. We use polling as a backup.

```typescript
class SerialReconnector {
  private scheduler = new ReconnectScheduler();
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private portPath: string,
    private openPort: () => Promise<void>,
  ) {}

  /** Start watching for the port to become available */
  startWatching(): void {
    this.scheduler.schedule(() => this.attemptReconnect());
  }

  private async attemptReconnect(): Promise<void> {
    // First check if the port exists (device is plugged in)
    const available = await this.isPortAvailable();

    if (!available) {
      console.log(`${this.portPath} not found — still waiting...`);
      this.scheduler.schedule(() => this.attemptReconnect());
      return;
    }

    try {
      await this.openPort();
      console.log(`Reconnected to ${this.portPath}`);
      this.scheduler.reset();
    } catch (err) {
      console.error(`Reconnect failed: ${(err as Error).message}`);
      this.scheduler.schedule(() => this.attemptReconnect());
    }
  }

  /** Check if a COM port is currently available in the system */
  private async isPortAvailable(): Promise<boolean> {
    const { SerialPort } = await import('serialport');
    const ports = await SerialPort.list();
    return ports.some((p) => p.path === this.portPath);
  }

  stop(): void {
    this.scheduler.cancel();
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
```

### 4.3 TCP Reconnection — Clean Socket Replacement

When a TCP connection drops, we must destroy the old socket and create
a fresh one. Reusing a closed socket does not work.

```typescript
class TcpReconnector {
  private scheduler = new ReconnectScheduler();
  private socket: net.Socket | null = null;

  constructor(
    private host: string,
    private port: number,
    private onConnected: (socket: net.Socket) => void,
    private onData: (data: Buffer) => void,
  ) {}

  connect(): void {
    // IMPORTANT: Always create a new socket — never reuse a closed one
    this.cleanup();

    this.socket = new net.Socket();
    this.socket.setKeepAlive(true, 30_000);

    this.socket.connect(this.port, this.host, () => {
      console.log(`Connected to ${this.host}:${this.port}`);
      this.scheduler.reset();
      this.onConnected(this.socket!);
    });

    this.socket.on('data', this.onData);

    this.socket.on('close', () => {
      console.log(`Connection to ${this.host}:${this.port} closed`);
      this.scheduleReconnect();
    });

    this.socket.on('error', (err: Error) => {
      console.error(`TCP error (${this.host}:${this.port}): ${err.message}`);
      // The 'close' event will follow — reconnect happens there
    });
  }

  private scheduleReconnect(): void {
    this.scheduler.schedule(() => this.connect());
  }

  private cleanup(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
  }

  destroy(): void {
    this.scheduler.cancel();
    this.cleanup();
  }
}
```

---

## 5. Windows Service with node-windows

`node-windows` wraps your Node.js script as a native Windows Service so it
starts on boot, runs in the background, and auto-restarts on crashes.
Think of it as turning your Node.js script into a "real" Windows program
that shows up in services.msc.

**Package:** `node-windows` (npm)

### 5.1 Install Script

Create a script like `scripts/install-windows-service.ts`:

```typescript
/**
 * Install the middleware as a Windows Service.
 * Run with: npx tsx scripts/install-windows-service.ts
 * Must be run as Administrator!
 */
import { Service } from 'node-windows';
import { resolve } from 'node:path';

const svc = new Service({
  name: 'MediMind Lab Middleware',
  description: 'Receives lab results from analyzers and forwards to Medplum Cloud',
  script: resolve('./dist/index.js'),

  // Restart configuration
  // The "grow" factor controls how quickly restart delays increase.
  // 0.25 = gentle growth (delays grow by 25% each time).
  grow: 0.25,

  // Wait 1 second before first restart
  wait: 1,

  // Maximum restarts within a 60-second window before stopping
  maxRestarts: 5,

  // Don't abort on recoverable errors
  abortOnError: false,

  // Node.js options
  nodeOptions: [
    '--max-old-space-size=512',  // Limit memory to 512MB
  ],

  // Environment variables for the service
  env: [
    { name: 'NODE_ENV', value: 'production' },
    { name: 'CONFIG_PATH', value: resolve('./config/analyzers.json') },
    { name: 'LOG_DIR', value: resolve('./logs') },
    { name: 'QUEUE_DB_PATH', value: resolve('./data/queue.db') },
    { name: 'LOG_LEVEL', value: 'info' },
  ],
});

svc.on('install', () => {
  console.log('Service installed. Starting...');
  svc.start();
});

svc.on('alreadyinstalled', () => {
  console.log('Service is already installed.');
});

svc.on('start', () => {
  console.log('Service started successfully.');
  console.log('Check Windows Services (services.msc) to verify.');
});

svc.on('error', (err: Error) => {
  console.error('Service error:', err.message);
});

// Run the installation
svc.install();
```

### 5.2 Uninstall Script

```typescript
/**
 * Uninstall the middleware Windows Service.
 * Run with: npx tsx scripts/uninstall-windows-service.ts
 * Must be run as Administrator!
 */
import { Service } from 'node-windows';
import { resolve } from 'node:path';

const svc = new Service({
  name: 'MediMind Lab Middleware',
  script: resolve('./dist/index.js'),
});

svc.on('uninstall', () => {
  console.log('Service uninstalled.');
});

svc.uninstall();
```

### 5.3 Running with Serial Port Permissions

| Setting | Recommendation |
|---------|---------------|
| **Run as** | `LocalSystem` (default) — has full access to COM ports |
| **Alternative** | A dedicated user account with "Log on as a service" right |
| **Admin required** | The install script must run as Administrator |
| **Auto-start** | node-windows sets services to auto-start by default |
| **Working directory** | Set via environment variables, not working directory (node-windows runs from its wrapper directory) |

**Important:** The service's working directory is NOT your project folder.
Always use absolute paths in your config and environment variables.
The `resolve()` calls in the install script convert relative paths to
absolute paths at install time.

### 5.4 Service Logging

node-windows creates a `.wrapper.log` file alongside your script's daemon
directory. This captures stdout/stderr from the wrapper itself (not your
app's Winston logs). For app-level logging, use Winston configured to write
to an absolute log directory.

### 5.5 Running As a Specific User (for domain environments)

```typescript
const svc = new Service({
  name: 'MediMind Lab Middleware',
  script: resolve('./dist/index.js'),
  // ... other options
});

// Set the user account (for domain environments or specific permissions)
svc.user.domain = 'HOSPITAL';
svc.user.account = 'lab-middleware-svc';
svc.user.password = 'SecurePassword123';
// This user must have "Log on as a service" right in Local Security Policy

svc.install();
```

---

## 6. SQLite Queue with better-sqlite3

When the internet goes down, the middleware cannot send results to Medplum.
Instead, it saves them in a local SQLite database and retries later.
Think of it as a "mailbox" — results wait in the queue until they can
be delivered.

**Package:** `better-sqlite3` (npm)
**API style:** Synchronous — no async/await needed. This is fine because
SQLite operations are fast (<1ms) and we only do simple queue operations.

### 6.1 Queue Implementation

```typescript
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';

interface QueueEntry {
  id: number;
  created_at: string;
  analyzer_id: string;
  payload: string;      // JSON-stringified FHIR resources
  attempts: number;
  last_attempt_at: string | null;
  last_error: string | null;
  status: 'pending' | 'processing' | 'failed' | 'completed';
}

class LocalQueue {
  private db: DatabaseType;

  // Prepared statements (reusable for performance)
  private stmtInsert: DatabaseType['Statement'];
  private stmtGetPending: DatabaseType['Statement'];
  private stmtMarkProcessing: DatabaseType['Statement'];
  private stmtMarkCompleted: DatabaseType['Statement'];
  private stmtMarkFailed: DatabaseType['Statement'];
  private stmtResetStale: DatabaseType['Statement'];
  private stmtCleanOld: DatabaseType['Statement'];
  private stmtCount: DatabaseType['Statement'];

  constructor(dbPath: string) {
    this.db = new Database(dbPath);

    // Enable WAL mode — much better performance for concurrent read/write
    // WAL = "Write-Ahead Logging" — reads don't block writes and vice versa
    this.db.pragma('journal_mode = WAL');

    // NORMAL sync mode — good balance of safety vs speed.
    // We can afford to lose the last ~1s of queued items on a power failure
    // because the analyzers can resend.
    this.db.pragma('synchronous = NORMAL');

    // Create the queue table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        analyzer_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_attempt_at TEXT,
        last_error TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK(status IN ('pending', 'processing', 'failed', 'completed'))
      )
    `);

    // Index for fast lookups of pending items
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_queue_status
      ON queue (status, created_at)
    `);

    // Prepare all statements up front (much faster than preparing each time)
    this.stmtInsert = this.db.prepare(
      `INSERT INTO queue (analyzer_id, payload) VALUES (?, ?)`
    );

    this.stmtGetPending = this.db.prepare(
      `SELECT * FROM queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`
    );

    this.stmtMarkProcessing = this.db.prepare(
      `UPDATE queue SET status = 'processing', last_attempt_at = datetime('now'),
       attempts = attempts + 1 WHERE id = ?`
    );

    this.stmtMarkCompleted = this.db.prepare(
      `DELETE FROM queue WHERE id = ?`
    );

    this.stmtMarkFailed = this.db.prepare(
      `UPDATE queue SET status = 'pending', last_error = ? WHERE id = ?`
    );

    this.stmtResetStale = this.db.prepare(
      `UPDATE queue SET status = 'pending'
       WHERE status = 'processing'
       AND last_attempt_at < datetime('now', '-5 minutes')`
    );

    this.stmtCleanOld = this.db.prepare(
      `DELETE FROM queue WHERE status = 'completed'
       AND created_at < datetime('now', '-7 days')`
    );

    this.stmtCount = this.db.prepare(
      `SELECT status, COUNT(*) as count FROM queue GROUP BY status`
    );

    // On startup, reset any items stuck in "processing" (crashed mid-send)
    this.resetStaleItems();
  }

  /** Add a result to the queue for later sending */
  enqueue(analyzerId: string, payload: object): number {
    const result = this.stmtInsert.run(analyzerId, JSON.stringify(payload));
    return Number(result.lastInsertRowid);
  }

  /** Get the next batch of pending items to process */
  getPending(limit = 10): QueueEntry[] {
    return this.stmtGetPending.all(limit) as QueueEntry[];
  }

  /** Mark an item as being processed (prevents double-processing) */
  markProcessing(id: number): void {
    this.stmtMarkProcessing.run(id);
  }

  /** Item was sent successfully — remove it from the queue */
  markCompleted(id: number): void {
    this.stmtMarkCompleted.run(id);
  }

  /** Sending failed — put it back in pending with the error */
  markFailed(id: number, error: string): void {
    this.stmtMarkFailed.run(error, id);
  }

  /** Reset items stuck in "processing" (e.g., after a crash) */
  resetStaleItems(): void {
    const result = this.stmtResetStale.run();
    if (result.changes > 0) {
      console.log(`Reset ${result.changes} stale queue items to pending`);
    }
  }

  /** Clean up old completed entries */
  cleanup(): void {
    const result = this.stmtCleanOld.run();
    if (result.changes > 0) {
      console.log(`Cleaned up ${result.changes} old queue entries`);
    }
  }

  /** Get queue statistics */
  getStats(): Record<string, number> {
    const rows = this.stmtCount.all() as Array<{ status: string; count: number }>;
    const stats: Record<string, number> = { pending: 0, processing: 0, failed: 0 };
    for (const row of rows) {
      stats[row.status] = row.count;
    }
    return stats;
  }

  /** Batch insert — much faster than individual inserts */
  enqueueBatch(items: Array<{ analyzerId: string; payload: object }>): void {
    const insertMany = this.db.transaction((batch: typeof items) => {
      for (const item of batch) {
        this.stmtInsert.run(item.analyzerId, JSON.stringify(item.payload));
      }
    });
    insertMany(items);
  }

  /** Close the database connection */
  close(): void {
    this.db.close();
  }
}
```

### 6.2 Retry Processor

This runs periodically to send queued items to Medplum.

```typescript
class RetryProcessor {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private queue: LocalQueue,
    private sendToMedplum: (payload: object) => Promise<void>,
    private intervalMs: number = 30_000,  // Try every 30 seconds
    private maxRetries: number = 100,
  ) {}

  start(): void {
    console.log(`Retry processor started (interval: ${this.intervalMs}ms)`);
    this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.running = false;
  }

  private async tick(): Promise<void> {
    if (this.running) return; // Prevent overlapping runs
    this.running = true;

    try {
      const pending = this.queue.getPending(10);

      for (const entry of pending) {
        if (entry.attempts >= this.maxRetries) {
          console.error(`Queue item ${entry.id} exceeded max retries — marking failed`);
          this.queue.markFailed(entry.id, 'Max retries exceeded');
          continue;
        }

        this.queue.markProcessing(entry.id);

        try {
          const payload = JSON.parse(entry.payload);
          await this.sendToMedplum(payload);
          this.queue.markCompleted(entry.id);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.queue.markFailed(entry.id, message);
          console.error(`Failed to send queue item ${entry.id}: ${message}`);
          // Stop processing this batch — server might be down
          break;
        }
      }
    } catch (err) {
      console.error('Retry processor error:', err);
    } finally {
      this.running = false;
      this.timer = setTimeout(() => this.tick(), this.intervalMs);
    }
  }
}
```

### 6.3 Database File Management

```typescript
// Check database size
import { statSync } from 'node:fs';

function getDatabaseSizeMB(dbPath: string): number {
  try {
    const stats = statSync(dbPath);
    return stats.size / (1024 * 1024);
  } catch {
    return 0;
  }
}

// WAL checkpoint — forces WAL file contents into the main database
// Run this periodically to prevent the WAL file from growing too large
function checkpoint(db: DatabaseType): void {
  db.pragma('wal_checkpoint(TRUNCATE)');
}

// Vacuum — reclaims unused space in the database file
// Run this occasionally (e.g., weekly) during low-activity periods
function vacuum(db: DatabaseType): void {
  db.exec('VACUUM');
}

// Periodic maintenance schedule:
// - Every hour: cleanup old completed entries
// - Every day: WAL checkpoint
// - Every week: VACUUM (only if DB is large)
```

---

## 7. Error Handling Patterns

### 7.1 Graceful Shutdown

When the service is stopped (SIGINT from Ctrl+C, SIGTERM from the OS,
or Windows Service stop), we must clean up: close serial ports, close
TCP connections, flush the queue database, and stop the API server.

```typescript
class GracefulShutdown {
  private cleanupFns: Array<() => Promise<void>> = [];
  private isShuttingDown = false;

  constructor() {
    // Ctrl+C in terminal
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    // Service manager stop
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));

    // Unhandled errors — log but still try to shut down cleanly
    process.on('uncaughtException', (err) => {
      console.error('Uncaught exception:', err);
      this.shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled rejection:', reason);
      // Don't shut down for unhandled rejections — just log
      // (Many are non-fatal, like a failed HTTP request)
    });
  }

  /** Register a cleanup function to run during shutdown */
  register(name: string, fn: () => Promise<void>): void {
    this.cleanupFns.push(async () => {
      console.log(`Shutting down: ${name}...`);
      try {
        await fn();
        console.log(`  ${name}: done`);
      } catch (err) {
        console.error(`  ${name}: error —`, err);
      }
    });
  }

  private async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) return; // Prevent double-shutdown
    this.isShuttingDown = true;

    console.log(`\nReceived ${signal} — starting graceful shutdown...`);

    // Give cleanup 10 seconds, then force-exit
    const forceTimer = setTimeout(() => {
      console.error('Shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000);

    // Run all cleanup functions
    for (const fn of this.cleanupFns) {
      await fn();
    }

    clearTimeout(forceTimer);
    console.log('Shutdown complete.');
    process.exit(0);
  }
}

// Usage in the main entry point:
const shutdown = new GracefulShutdown();

// Register cleanup in reverse order of startup
shutdown.register('API server', async () => {
  await new Promise<void>((resolve) => apiServer.close(() => resolve()));
});

shutdown.register('Retry processor', async () => {
  retryProcessor.stop();
});

shutdown.register('Connections', async () => {
  await connectionManager.closeAll();
});

shutdown.register('Queue database', async () => {
  queue.close();
});

shutdown.register('Logger', async () => {
  logger.close();
});
```

### 7.2 Per-Connection Error Isolation

One analyzer crashing must NOT take down the whole service. Each
connection runs independently.

```typescript
// PATTERN: Wrap each connection's data handler in try/catch
connectionManager.on('data', (analyzerId, data) => {
  try {
    const handler = protocolHandlers.get(analyzerId);
    if (!handler) return;

    handler.processData(data);
  } catch (err) {
    // Log the error but don't re-throw — other analyzers keep running
    console.error(`Error processing data from ${analyzerId}:`, err);

    // Track the error for the status API
    analyzerStatuses.get(analyzerId)?.recordError(err as Error);
  }
});

// PATTERN: Each protocol handler manages its own state independently
class ASTMHandler {
  // Each instance has its own state machine — isolated from others
  private state: 'idle' | 'receiving' | 'sending' = 'idle';
  private frameBuffer: Buffer[] = [];

  processData(data: Buffer): void {
    // If this throws, only this analyzer is affected
    // The connectionManager's event handler catches it above
  }
}
```

### 7.3 Logging with Winston

```typescript
import winston from 'winston';
import { resolve } from 'node:path';

const LOG_DIR = process.env.LOG_DIR || resolve('./logs');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: 'lab-middleware' },
  transports: [
    // All logs go to combined.log
    new winston.transports.File({
      filename: resolve(LOG_DIR, 'combined.log'),
      maxsize: 10 * 1024 * 1024, // 10 MB per file
      maxFiles: 10,               // Keep 10 rotated files
      tailable: true,
    }),
    // Errors get their own file for easy scanning
    new winston.transports.File({
      filename: resolve(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
      handleExceptions: true,
      handleRejections: true,
    }),
  ],
});

// Add console output in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
    ),
  }));
}

// Usage:
logger.info('Middleware started', { version: '0.1.0', analyzers: 10 });
logger.error('Failed to send to Medplum', { error: 'Connection refused', attempt: 3 });
logger.debug('ASTM frame received', { analyzerId: 'sysmex-xn550', bytes: 142 });

// Child loggers for per-analyzer logging
function createAnalyzerLogger(analyzerId: string): winston.Logger {
  return logger.child({ analyzerId });
}

const sysmexLog = createAnalyzerLogger('sysmex-xn550');
sysmexLog.info('Connected');  // Automatically includes { analyzerId: 'sysmex-xn550' }
```

---

## 8. Performance Considerations

### 8.1 Load Profile

The middleware handles approximately 3000 results per day across 10 analyzers.
That is roughly **2 results per minute** — extremely low load. Performance
is NOT the bottleneck; reliability and correctness are.

| Metric | Value | Impact |
|--------|-------|--------|
| Results per day | ~3,000 | Trivial for Node.js |
| Results per minute | ~2 | No batching needed |
| Concurrent connections | 10 | Well within limits |
| Message size | 0.5-5 KB typical | Negligible memory |
| FHIR POST size | 1-10 KB | Negligible bandwidth |

### 8.2 Memory Management for Long-Running Services

The middleware runs 24/7 for months. Memory leaks that are invisible in
a 5-minute test become fatal over weeks.

```typescript
// RULE 1: Remove event listeners when done
// BAD — leaks one listener per reconnection:
port.on('data', handleData);   // Added again after reconnect!

// GOOD — remove before re-adding:
port.removeAllListeners('data');
port.on('data', handleData);

// RULE 2: Set maxListeners appropriately
// 10 analyzers + internal events = ~20 listeners is normal
connectionManager.setMaxListeners(20);

// RULE 3: Use WeakRef or manual cleanup for caches
// BAD — map grows forever:
const messageCache = new Map<string, object>();

// GOOD — bounded cache with eviction:
class BoundedCache<K, V> {
  private cache = new Map<K, V>();
  constructor(private maxSize: number) {}

  set(key: K, value: V): void {
    if (this.cache.size >= this.maxSize) {
      // Delete oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  get(key: K): V | undefined {
    return this.cache.get(key);
  }
}

// RULE 4: Monitor memory usage periodically
setInterval(() => {
  const usage = process.memoryUsage();
  logger.debug('Memory usage', {
    heapUsedMB: Math.round(usage.heapUsed / 1024 / 1024),
    rssMB: Math.round(usage.rss / 1024 / 1024),
    externalMB: Math.round(usage.external / 1024 / 1024),
  });
}, 60_000); // Log every minute
```

### 8.3 Avoiding EventEmitter Memory Leaks

```typescript
// The #1 cause of EventEmitter leaks in long-running services:
// Adding listeners in a loop or reconnection handler without removing old ones.

// ANTI-PATTERN:
function handleReconnect(port: SerialPort) {
  port.on('data', (data) => { /* ... */ });  // LEAK: adds a NEW listener each time!
}

// CORRECT PATTERN:
function handleReconnect(port: SerialPort, handler: (data: Buffer) => void) {
  port.removeAllListeners('data');  // Clean up first
  port.on('data', handler);
}

// ALTERNATIVE: Use named functions so you can remove specifically
function onData(data: Buffer) { /* ... */ }

port.off('data', onData);  // Remove this specific listener
port.on('data', onData);   // Re-add it
```

### 8.4 File Descriptor Management

Each open serial port and TCP socket uses a file descriptor. With 10
analyzers, that is only 10 descriptors — well within the OS limit
(typically 1024+ on Windows). But be careful with:

- Reconnection loops that don't close old ports/sockets before opening new ones
- Log files that are opened but never closed
- SQLite WAL files that are never checkpointed

```typescript
// Track open resources for debugging
let openSerialPorts = 0;
let openTcpSockets = 0;

port.on('open', () => { openSerialPorts++; });
port.on('close', () => { openSerialPorts--; });

socket.on('connect', () => { openTcpSockets++; });
socket.on('close', () => { openTcpSockets--; });

// Log periodically
setInterval(() => {
  logger.debug('Open resources', { openSerialPorts, openTcpSockets });
}, 300_000); // Every 5 minutes
```

---

## Sources

### Official Documentation
- [serialport npm](https://www.npmjs.com/package/serialport) — Serial port library (v12+/13.x)
- [serialport.io](https://serialport.io/) — Official documentation site
- [Node.js net module](https://nodejs.org/api/net.html) — TCP server/client API
- [Node.js events](https://nodejs.org/api/events.html) — EventEmitter API
- [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3) — Synchronous SQLite
- [Winston GitHub](https://github.com/winstonjs/winston) — Logging library
- [node-windows GitHub](https://github.com/coreybutler/node-windows) — Windows Service wrapper

### Community Resources
- [node-windows npm](https://www.npmjs.com/package/node-windows) — Package details and API
- [serialport disconnect detection](https://github.com/serialport/node-serialport/issues/1330) — Windows USB disconnect issues
- [typed-emitter](https://github.com/andywer/typed-emitter) — Type-safe EventEmitter for TypeScript
- [Node.js graceful shutdown](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html) — Express shutdown patterns
- [Node.js TCP patterns](https://gist.github.com/tedmiston/5935757) — TCP client/server examples

### Key Decisions for Our Middleware
- **Parser choice:** InterByteTimeoutParser for ASTM (interval: 100ms)
- **Reconnection:** Exponential backoff with jitter, max 60s delay, no max attempts
- **Queue:** better-sqlite3 with WAL mode, prepared statements
- **Logging:** Winston with file rotation (10MB x 10 files)
- **Service:** node-windows with auto-restart, run as LocalSystem
- **Error isolation:** try/catch per connection, never let one analyzer crash the service
