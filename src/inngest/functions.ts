import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { inngest } from "./client";

export const demoGenerate = inngest.createFunction(
  { id: "demo-generate" },
  { event: "demo/generate" },
  async ({  step }) => {
    await step.run("generate-text", async () => {
        return await generateText({
          model: google("gemini-2.5-flash"),
          prompt: "write a vegetatian lasagna recipe for 4 people",
        })
    })
  },
);