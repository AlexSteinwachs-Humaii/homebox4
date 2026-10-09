import { readFileSync } from "node:fs";
import { createSSRApp, defineComponent, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it } from "vitest";

// Render the real card template with presentation-only dependencies stubbed.
const source = readFileSync(new URL("./Card.vue", import.meta.url), "utf8");
const template = source.slice(source.indexOf("<template>") + 10, source.indexOf("</template>"));

async function renderCard(showAssetId = false) {
  const app = createSSRApp({
    template,
    setup: () => ({
      showAssetId,
      item: {
        id: "camera-id",
        name: "Camera",
        assetId: "000-001",
        quantity: 2,
        description: "Camera description",
      },
      tableRow: null,
      imageUrl: null,
      objectContain: false,
      locationString: "Office",
      itemTags: [],
    }),
  });
  app.config.globalProperties.$t = (key: string) => (key === "items.asset_id" ? "Asset ID" : key);
  const passthrough = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h("div", slots.default?.()),
  });
  for (const name of [
    "Card",
    "Checkbox",
    "Badge",
    "Separator",
    "TooltipProvider",
    "Tooltip",
    "TooltipTrigger",
    "TooltipContent",
    "MdiShieldCheck",
    "MdiArchive",
    "Markdown",
    "TagChip",
  ]) {
    app.component(name, passthrough);
  }
  app.component(
    "NuxtLink",
    defineComponent({
      props: ["to"],
      setup:
        (props, { slots }) =>
        () =>
          h("a", { href: props.to }, slots.default?.()),
    })
  );
  return renderToString(app);
}

describe("Recently Added responsive cards", () => {
  it("renders a translated Asset ID without losing leading zeros and keeps the item link and quantity", async () => {
    const html = await renderCard(true);
    expect(html).toContain("Asset ID: 000-001");
    expect(html).toContain('href="/item/camera-id"');
    expect(html).toContain("Camera");
    expect(html).toMatch(/>2<\/div>/);
  });

  it("does not add Asset ID to other card consumers", async () => {
    const html = await renderCard();
    expect(html).not.toContain("Asset ID:");
    expect(html).not.toContain("000-001");
    expect(source).toMatch(/showAssetId:\s*\{\s*type: Boolean,\s*default: false/);
  });
});
