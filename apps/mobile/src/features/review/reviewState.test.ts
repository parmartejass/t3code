import { describe, expect, it } from "vite-plus/test";

import {
  getReviewTurnDiffsSnapshot,
  MAX_CACHED_REVIEW_DIFFS,
  MAX_CACHED_REVIEW_SOURCE_CHARACTERS,
  setReviewTurnDiff,
} from "./reviewState";

describe("setReviewTurnDiff", () => {
  it("drops the oldest raw turn diffs across threads once the cache is full", () => {
    const threadKeys = Array.from(
      { length: MAX_CACHED_REVIEW_DIFFS + 1 },
      (_, index) => `env:count-${index}`,
    );
    for (const threadKey of threadKeys) setReviewTurnDiff(threadKey, "turn:1", "diff");

    expect(getReviewTurnDiffsSnapshot(threadKeys[0]!)).toEqual({});
    expect(getReviewTurnDiffsSnapshot(threadKeys.at(-1)!)).toEqual({ "turn:1": "diff" });
  });

  it("bounds retained raw diff characters, keeping the latest diff", () => {
    const half = "x".repeat(MAX_CACHED_REVIEW_SOURCE_CHARACTERS / 2);
    setReviewTurnDiff("env:size", "turn:1", half);
    setReviewTurnDiff("env:size", "turn:2", half);
    setReviewTurnDiff("env:size", "turn:3", half);

    expect(Object.keys(getReviewTurnDiffsSnapshot("env:size"))).toEqual(["turn:2", "turn:3"]);
  });
});
