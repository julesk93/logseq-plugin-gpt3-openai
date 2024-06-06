import "./ui/style.css";
import "@logseq/libs";
import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { fetchRecipe } from "./lib/openai";
import { getOpenaiSettings, settingsSchema } from "./lib/settings";
// import { BlockEntity } from "@logseq/libs/dist/LSPlugin.user";

logseq.useSettingsSchema(settingsSchema);

const LogseqApp = () => {
  useEffect(() => {
    logseq.Editor.registerSlashCommand("fetch recipe", async (b) => {
      const block = await logseq.Editor.getBlock(b.uuid);
      if (block && block.content) {
        console.log("Block Content:", block.content); // Debug output

        const openAiSettings = getOpenaiSettings();
        try {
          const recipeInfo = await fetchRecipe(block.content, openAiSettings);
          console.log("Recipe Info:", recipeInfo); // Debug output

          if (recipeInfo.error) {
            logseq.App.showMsg(recipeInfo.error);
            return;
          }

          const nutritionInfo = recipeInfo.nutrition_information
            ? Object.entries(recipeInfo.nutrition_information)
                .map(([key, value]) => `${key}: ${value}`)
                .join(", ")
            : "";

          const mainBlockContent =
            `### ${recipeInfo.title}\n` +
            `type:: recipe\n` +
            `category:: ${recipeInfo.category}\n` +
            `tags:: ${recipeInfo.tags ? recipeInfo.tags.join(", ") : ""}\n` +
            `cuisine:: ${recipeInfo.cuisine}\n` +
            `ingredients:: ${recipeInfo.individual_ingredients}\n` +
            `total-time:: ${recipeInfo.total_time}\n` +
            `prep_time:: ${recipeInfo.prep_time}\n` +
            `cook_time:: ${recipeInfo.cook_time}\n` +
            `servings:: ${recipeInfo.servings}\n` +
            `nutrition:: ${nutritionInfo}\n` +
            `url:: [Link](${recipeInfo.source_url})\n` +
            `description:: ${recipeInfo.description}`;

          const mainBlock = await logseq.Editor.insertBlock(block.uuid, mainBlockContent, { sibling: true });

          if (recipeInfo.image_url) {
            await logseq.Editor.insertBlock(mainBlock!.uuid, `![](${recipeInfo.image_url})`, { sibling: false });
          }

          if (recipeInfo.ingredients && Array.isArray(recipeInfo.ingredients)) {
            await logseq.Editor.insertBlock(mainBlock!.uuid, `Ingredients: ${recipeInfo.ingredients.join(", ")}`, { sibling: false });
          }

          if (recipeInfo.instructions && Array.isArray(recipeInfo.instructions)) {
            const instructionsBlock = await logseq.Editor.insertBlock(mainBlock!.uuid, "Instructions:", { sibling: false });
            for (const instruction of recipeInfo.instructions) {
              await logseq.Editor.insertBlock(instructionsBlock!.uuid, instruction, { sibling: false });
            }
          }
        } catch (error) {
          if (error instanceof Error) {
            logseq.App.showMsg(`Error: ${error.message}`, "error");
          } else {
            logseq.App.showMsg("An unexpected error occurred.", "error");
          }
        }
      }
    });
  }, []);

  return null; // No UI component needed
};

async function main() {
  const root = ReactDOM.createRoot(document.getElementById("app")!);
  root.render(
    <React.StrictMode>
      <LogseqApp />
    </React.StrictMode>
  );
}

logseq.ready(main).catch(console.error);