// ABOUTME: Tests for negative-pattern suppression — rules that reduce false positives
// ABOUTME: in stale-claim detection (historical narration, quotations, resolved claims).
import { describe, it, expect } from "vitest";
import { suppressionScore } from "../../src/detector/suppress";

describe("suppression", () => {
  it("suppresses historical narration framed in the past", () => {
    // "In 1944, the Army planned to..." — past-framed, not an unresolved expectation
    expect(suppressionScore("In 1944, the Army planned to invade.", 1944)).toBeGreaterThan(0);
  });
  it("suppresses direct quotations", () => {
    expect(suppressionScore('A spokesman said it "is expected to launch in 2017".', 2017)).toBeGreaterThan(0);
  });
  it("does not suppress a plain unresolved future-past claim", () => {
    expect(suppressionScore("The Navy plans to award a contract in 2017.", 2017)).toBe(0);
  });
  it("suppresses a month-dateline historical narration (frame year matches the claim year)", () => {
    // "In March 2013, the administration announced plans to..." — the year is the dateline of
    // a past announcement, not a forward target. Frame year 2013 == claim year 2013.
    expect(
      suppressionScore("In March 2013, the Obama administration announced plans to add 14 interceptors.", 2013)
    ).toBeGreaterThan(0);
  });
  it("suppresses a bare-year dateline regardless of the reporting verb", () => {
    // "In 2008, ... said ... will ..." — historical narration of a past statement; the old
    // verb-cue list ("planned|expected|was scheduled") missed reporting verbs like "said".
    expect(
      suppressionScore("In 2008, Rear Admiral Dwyer said these changes will make it possible.", 2008)
    ).toBeGreaterThan(0);
  });
  it("does not suppress a leading-dateline claim whose target year differs from the frame year", () => {
    // Frame year 2015 != claim year 2020 — the forward target (2020) is preserved, not narration.
    expect(
      suppressionScore("In 2015, the program was expected to deliver new radars in 2020.", 2020)
    ).toBe(0);
  });
  it("suppresses early/late qualifier datelines but not an arbitrary word before the year", () => {
    // "In early 2007" is a real dateline (qualifier) — suppress.
    expect(suppressionScore("In early 2007, the Navy plans to deploy a system.", 2007)).toBeGreaterThan(0);
    // "In the 2008 budget" is a budget-year reference, NOT a dateline — the forward claim
    // ("plans to procure") must survive. The month slot must not match the filler word "the".
    expect(suppressionScore("In the 2008 budget, the Navy plans to procure 14 ships.", 2008)).toBe(0);
  });
  it("only treats later/subsequently/ultimately as resolution when a resolution verb follows", () => {
    // Resolution narration — the claim was resolved nearby; suppress.
    expect(suppressionScore("The merger, later completed, was expected to close in 2018.", 2018)).toBeGreaterThan(0);
    // Plain temporal "later" before a forward event is NOT resolution — must not suppress.
    expect(suppressionScore("The system will be deployed later in 2017.", 2017)).toBe(0);
  });
  it("suppresses leading 'On <full date>' historical datelines", () => {
    // The dominant FP on real articles: a sentence that OPENS with a full date narrating
    // a past event ("On <day> <month> <year>, X announced/awarded/stated ...").
    expect(suppressionScore("On 30 August 2018, the U.S. Navy announced Boeing as the winner and awarded a contract.", 2018)).toBeGreaterThan(0);
    expect(suppressionScore("On April 6, 2009, the Secretary of Defense announced plans to cut spending.", 2009)).toBeGreaterThan(0);
    expect(suppressionScore("On 21 October 2013, executives stated that the Army plans to downselect in 2014.", 2013)).toBeGreaterThan(0);
  });
  it("does not suppress a forward claim that begins with its subject rather than a date", () => {
    expect(suppressionScore("Testing of the vehicle is expected to begin in 2020.", 2020)).toBe(0);
    expect(suppressionScore("The Army plans to buy 133 vehicles starting in 2014.", 2014)).toBe(0);
  });
  it("suppresses mid-sentence attribution: a reporting/event verb dated to the claim year", () => {
    // The claim is reported content dated to a past event — the article narrates what was
    // announced/reported AT that time, it does not assert the forward claim directly.
    expect(suppressionScore("The Indian Army first announced plans to acquire 145 M777s for $400 million in January 2010.", 2010)).toBeGreaterThan(0);
    expect(suppressionScore("Reuters reported on 1 June 2022 that the administration plans to sell four drones.", 2022)).toBeGreaterThan(0);
    expect(suppressionScore("The US Army released a draft solicitation on June 22, 2018 for proposals.", 2018)).toBeGreaterThan(0);
  });
  it("does not treat a directly-asserted forward target as attribution", () => {
    // No reporting/event verb precedes the target year — the forward "in 2019" is the claim,
    // not a dateline. ("signed" appears only AFTER the year, so the verb-then-date shape fails.)
    expect(suppressionScore("The radar will be delivered in 2019, years after the contract was signed.", 2019)).toBe(0);
  });
});
