import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { OAuthFeedback } from "../client/src/pages/Integrations";
import { SnapshotStateBadge } from "../client/src/pages/Monitoring";
import { SetupMilestoneBadge } from "../client/src/pages/SetupWizard";
import { ReleaseTrustBadge } from "../client/src/pages/Download";

describe("monitoring and setup UI feedback", () => {
  it.each(["current", "stale", "unconfirmed", "unseen", "missing_policy"] as const)("renders the %s snapshot badge", state => {
    expect(renderToStaticMarkup(createElement(SnapshotStateBadge, { state }))).toContain(state.replace("_", " "));
  });

  it("renders completed and in-progress setup milestone feedback", () => {
    expect(renderToStaticMarkup(createElement(SetupMilestoneBadge, { complete: true }))).toContain("complete");
    expect(renderToStaticMarkup(createElement(SetupMilestoneBadge, { complete: false }))).toContain("in progress");
  });

  it("renders an explicit rejected OAuth feedback state", () => {
    expect(renderToStaticMarkup(createElement(OAuthFeedback, { notice: "rejected", onRetry: () => undefined, loading: false }))).toContain("GitHub authorization was rejected");
  });

  it("labels unpublished local release artifacts as unsigned rather than implying code signing", () => {
    expect(renderToStaticMarkup(createElement(ReleaseTrustBadge, { published: false }))).toContain("signed release pending");
    expect(renderToStaticMarkup(createElement(ReleaseTrustBadge, { published: true }))).toContain("signed release available");
  });
});
