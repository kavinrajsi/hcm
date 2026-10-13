import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AvatarStack } from "./avatar-stack";

const people = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: String(index), name: `Person ${index + 1}`, avatarKey: null }));
const render = (count: number, max?: number) =>
  renderToStaticMarkup(createElement(AvatarStack, { people: people(count), max }));

describe("AvatarStack", () => {
  it("shows everyone when they fit", () => {
    const html = render(4);
    expect(html.match(/<li/g)).toHaveLength(4);
    expect(html).not.toContain("more:");
  });

  it("folds the rest into the … bubble, names in its tooltip", () => {
    const html = render(6);
    expect(html.match(/<li/g)).toHaveLength(4); // 3 photos + bubble
    expect(html).toContain('title="Person 4, Person 5, Person 6"');
    expect(html).toContain("and 3 more: Person 4, Person 5, Person 6");
  });

  it("honours a smaller max on phones", () => {
    expect(render(5, 3).match(/<li/g)).toHaveLength(3);
  });
});
