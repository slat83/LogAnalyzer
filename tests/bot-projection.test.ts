import { describe, it, expect } from "vitest";
import { projectBots } from "@/lib/bot-projection";
import type { BotData, DayCount } from "@/lib/types";

function fixtureBots(): Record<string, BotData> {
  return {
    googlebot: {
      requests: 600,
      byDay: [
        { date: "2026-04-08", count: 100 },
        { date: "2026-04-09", count: 200 },
        { date: "2026-04-10", count: 300 },
      ],
      topPages: [{ url: "/", count: 300 }],
    },
    bingbot: {
      requests: 60,
      byDay: [
        { date: "2026-04-08", count: 10 },
        { date: "2026-04-09", count: 20 },
        { date: "2026-04-10", count: 30 },
      ],
      topPages: [],
    },
    facebookbot: {
      // No activity in the window we'll test — should be dropped when filtering
      requests: 50,
      byDay: [{ date: "2026-04-01", count: 50 }],
      topPages: [],
    },
  };
}

function fixtureRequestsByDay(): DayCount[] {
  return [
    // Totals > sum of bot byDay on each day; the difference is humans.
    { date: "2026-04-01", count: 100 },
    { date: "2026-04-08", count: 200 },   // bots: 100+10 = 110, humans: 90
    { date: "2026-04-09", count: 400 },   // bots: 200+20 = 220, humans: 180
    { date: "2026-04-10", count: 600 },   // bots: 300+30 = 330, humans: 270
  ];
}

const fullBotVsHuman = {
  bot: { requests: 710, avgResponseTime: 0.12 },
  human: { requests: 590, avgResponseTime: 0.25 },
};

describe("projectBots — no filter", () => {
  it("passes through the summary unchanged", () => {
    const out = projectBots(
      fixtureBots(),
      fixtureRequestsByDay(),
      fullBotVsHuman,
      1300,
      null,
      null,
    );
    expect(out.isFiltered).toBe(false);
    expect(out.totalRequests).toBe(1300);
    expect(out.botVsHuman).toEqual(fullBotVsHuman);
    // Sorted by requests desc
    expect(out.bots.map((b) => b.name)).toEqual(["googlebot", "bingbot", "facebookbot"]);
  });
});

describe("projectBots — filtered window", () => {
  it("recomputes each bot's request count by summing byDay within the window", () => {
    const out = projectBots(
      fixtureBots(),
      fixtureRequestsByDay(),
      fullBotVsHuman,
      1300,
      "2026-04-09",
      "2026-04-10",
    );
    const gbot = out.bots.find((b) => b.name === "googlebot");
    const bing = out.bots.find((b) => b.name === "bingbot");
    expect(gbot?.requests).toBe(500); // 200 + 300
    expect(bing?.requests).toBe(50);  // 20 + 30
  });

  it("drops bots with zero requests in the window", () => {
    const out = projectBots(
      fixtureBots(),
      fixtureRequestsByDay(),
      fullBotVsHuman,
      1300,
      "2026-04-09",
      "2026-04-10",
    );
    expect(out.bots.map((b) => b.name)).not.toContain("facebookbot");
  });

  it("filters totalRequests to the window sum of requestsByDay", () => {
    const out = projectBots(
      fixtureBots(),
      fixtureRequestsByDay(),
      fullBotVsHuman,
      1300,
      "2026-04-09",
      "2026-04-10",
    );
    expect(out.totalRequests).toBe(1000); // 400 + 600
  });

  it("computes botVsHuman.bot as sum of filtered bots and human as total - bots", () => {
    const out = projectBots(
      fixtureBots(),
      fixtureRequestsByDay(),
      fullBotVsHuman,
      1300,
      "2026-04-09",
      "2026-04-10",
    );
    // Bots in window: googlebot 500 + bingbot 50 = 550
    expect(out.botVsHuman.bot.requests).toBe(550);
    // Humans: 1000 - 550 = 450
    expect(out.botVsHuman.human.requests).toBe(450);
  });

  it("keeps avgResponseTime at its full-range value (not recoverable per-day)", () => {
    const out = projectBots(
      fixtureBots(),
      fixtureRequestsByDay(),
      fullBotVsHuman,
      1300,
      "2026-04-09",
      "2026-04-10",
    );
    expect(out.botVsHuman.bot.avgResponseTime).toBe(0.12);
    expect(out.botVsHuman.human.avgResponseTime).toBe(0.25);
  });

  it("clamps negative human counts to zero if bot byDay exceeds total for that day", () => {
    // Pathological: bot byDay sums to more than requestsByDay total. Can happen
    // if the parser classification disagrees slightly with the requests
    // counter. Must not render a negative human number.
    const out = projectBots(
      { x: { requests: 500, byDay: [{ date: "2026-04-09", count: 500 }], topPages: [] } },
      [{ date: "2026-04-09", count: 400 }],
      fullBotVsHuman,
      500,
      "2026-04-09",
      "2026-04-09",
    );
    expect(out.botVsHuman.bot.requests).toBe(500);
    expect(out.botVsHuman.human.requests).toBe(0);
  });

  it("sorts the bots list by filtered request count descending", () => {
    // bingbot has more recent traffic; under a late window it should top the list.
    const bots: Record<string, BotData> = {
      googlebot: { requests: 1000, byDay: [{ date: "2026-04-01", count: 1000 }], topPages: [] },
      bingbot: { requests: 100, byDay: [{ date: "2026-04-09", count: 100 }], topPages: [] },
    };
    const out = projectBots(
      bots,
      [{ date: "2026-04-09", count: 200 }],
      fullBotVsHuman,
      1100,
      "2026-04-09",
      "2026-04-09",
    );
    expect(out.bots.map((b) => b.name)).toEqual(["bingbot"]);
  });
});

describe("projectBots — empty edge cases", () => {
  it("returns zero totals when the window contains no data", () => {
    const out = projectBots(
      fixtureBots(),
      fixtureRequestsByDay(),
      fullBotVsHuman,
      1300,
      "2026-05-01",
      "2026-05-10",
    );
    expect(out.totalRequests).toBe(0);
    expect(out.bots).toHaveLength(0);
    expect(out.botVsHuman.bot.requests).toBe(0);
    expect(out.botVsHuman.human.requests).toBe(0);
  });
});
