import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buttonVariants } from "./button";

describe("outline button", () => {
  it("paints a light label on the dark fill and keeps a focus ring", () => {
    const classes = buttonVariants({ variant: "outline" });
    assert.match(classes, /bg-background/);
    assert.match(classes, /(?<![:\w-])text-foreground/);
    assert.match(classes, /focus-visible:ring-primary/);
    assert.match(classes, /focus-visible:outline-solid/);
    assert.match(classes, /focus-visible:outline-primary/);
    assert.doesNotMatch(classes, /dark:bg-input/);
  });
});
