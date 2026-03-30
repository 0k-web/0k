declare module 'libcurl.js' {
  type RawHeaders = [string, string][];

  type LibcurlResponse = Response & {
    raw_headers?: RawHeaders;
  };

  type LibcurlWebSocketOptions = {
    headers?: HeadersInit | RawHeaders;
  };

  type LibcurlWebSocket = WebSocket;

  type HTTPSession = {
    fetch(input: string, init?: RequestInit): Promise<LibcurlResponse>;
    close(): void;
  };

  export const libcurl: {
    ready: boolean;
    onload?: (() => void) | undefined;
    transport: unknown;
    version: {
      lib: string;
    };
    load_wasm(url: string): Promise<void>;
    set_websocket(url: string): void;
    HTTPSession: new () => HTTPSession;
    WebSocket: new (
      url: string,
      protocols?: string | string[],
      options?: LibcurlWebSocketOptions,
    ) => LibcurlWebSocket;
  };
}
