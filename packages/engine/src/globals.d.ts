// The engine runs in browsers and on servers, so it is type-checked without the
// DOM or Node types. These are the few web-standard globals it uses, which both
// provide.

declare class URL {
  constructor(url: string, base?: string);
  readonly host: string;
}
