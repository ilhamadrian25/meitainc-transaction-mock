/** Operator matcher untuk satu nilai (query / header / field body). */
export type ValueMatcher =
  | string
  | number
  | boolean
  | null
  | Array<string | number | boolean | null>
  | {
      $eq?: unknown;
      $ne?: unknown;
      $in?: unknown[];
      $nin?: unknown[];
      $regex?: string;
      $exists?: boolean;
      $gt?: number;
      $gte?: number;
      $lt?: number;
      $lte?: number;
      $contains?: string;
    };

export interface RuleRequest {
  /** GET | POST | ... | "*" (default "*"). Boleh array: ["GET","HEAD"]. */
  method?: string | string[];
  /**
   * Path relatif terhadap /api/mock.
   * Dukung ":param" (named) dan "*" (wildcard sisa segment).
   * Contoh: "/products", "/transactions/:id", "/files/*"
   * Kalau dikosongkan = cocok untuk path apa pun.
   */
  path?: string;
  query?: Record<string, ValueMatcher>;
  headers?: Record<string, ValueMatcher>;
  /** Dicocokkan ke JSON body; key boleh dot-path, mis. "customer.msisdn". */
  body?: Record<string, ValueMatcher>;
}

export interface RuleResponse {
  status?: number;
  headers?: Record<string, string>;
  /** Body JSON. Dukung templating {{query.product}} dst. */
  body?: unknown;
  /** Kalau diisi, dikirim apa adanya sebagai text (menang atas `body`). */
  text?: string;
  /** Delay artifisial dalam ms, untuk uji loading state / timeout. */
  delayMs?: number;
}

export interface MockRule {
  id: string;
  description?: string;
  /** Rule non-aktif dilewati. Default true. */
  enabled?: boolean;
  /** Prioritas manual; makin besar makin menang. Default 0. */
  priority?: number;
  request: RuleRequest;
  response: RuleResponse;
  /** Response bergantian tiap hit (mis. pending -> pending -> success). */
  sequence?: RuleResponse[];
  /** File asal rule, diisi oleh loader. */
  _source?: string;
}

export interface MockFile {
  /** Prefix path yang otomatis ditambahkan ke semua rule di file ini. */
  basePath?: string;
  rules: MockRule[];
}

export interface RequestContext {
  method: string;
  path: string;
  query: Record<string, string | string[]>;
  headers: Record<string, string>;
  body: unknown;
  params: Record<string, string>;
}
