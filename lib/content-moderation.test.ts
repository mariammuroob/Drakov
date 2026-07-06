import { describe, expect, it } from "vitest";
import { moderatePublicText } from "./content-moderation";

describe("moderatePublicText", () => {
  it("allows ordinary public text", () => expect(moderatePublicText("Patience compounds.")) .toBe("allowed"));
  it("blocks profanity", () => expect(moderatePublicText("this is shit")) .toBe("blocked"));
  it("blocks common spam", () => expect(moderatePublicText("Click here for free money")) .toBe("blocked"));
  it("flags suspicious link shorteners", () => expect(moderatePublicText("See bit.ly/example")) .toBe("flagged"));
  it("flags long shouting", () => expect(moderatePublicText("GUARANTEEDWINNER")) .toBe("flagged"));
});
