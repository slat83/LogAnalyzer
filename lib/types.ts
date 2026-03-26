export interface DayCount {
  date: string;
  count: number;
}

export interface UACount {
  ua: string;
  count: number;
}

export interface Cluster {
  pattern: string;
  count: number;
  statuses: Record<string, number>;
  responseTime: { avg: number; p95: number };
  byDay: DayCount[];
  topUAs: UACount[];
}

export interface ErrorEntry {
  pattern: string;
  count: number;
  examples?: string[];
}

export interface SlowEntry {
  pattern: string;
  avgTime: number;
  count: number;
}

export interface BotData {
  requests: number;
  topPages: { url: string; count: number }[];
  byDay: DayCount[];
}

export interface Summary {
  totalRequests: number;
  uniqueUrls: number;
  dateRange: { from: string; to: string };
  requestsByDay: DayCount[];
  statusCodes: Record<string, number>;
  responseTime: { avg: number; median: number; p95: number; p99: number };
  clusters: Cluster[];
  errors: {
    "404": ErrorEntry[];
    "500": ErrorEntry[];
    slow: SlowEntry[];
  };
  bots: Record<string, BotData>;
  botVsHuman: {
    bot: { requests: number; avgResponseTime: number };
    human: { requests: number; avgResponseTime: number };
  };
}
