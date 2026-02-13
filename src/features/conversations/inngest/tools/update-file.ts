import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

import { convex } from "@/lib/convex-client";

import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";

interface UpdateFileToolOptions {
  internalKey: string;
}

const paramsSchema = z.object({
  fileId: z.string().min(1, "File ID is required"),
  content: z.string(),
});

export const createUpdateFileTool = ({
  internalKey,
}: UpdateFileToolOptions) => {
  return createTool({
    name: "updateFile",
    description: "Update the content of an existing file",
    parameters: z.object({
      fileId: z.string().describe("The ID of the file to update"),
      content: z.string().describe("The new content for the file"),
    }),
    handler: async (params, { step: toolStep }) => {
      const parsed = paramsSchema.safeParse(params);
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const { fileId, content: rawContent } = parsed.data;

      // Validate file exists before running the step
      const file = await convex.query(api.system.getFileById, {
        internalKey,
        fileId: fileId as Id<"files">,
      });


      if (!file) {
        return `Error: File with ID "${fileId}" not found. Use listFiles to get valid file IDs.`;
      }

      if (file.type === "folder") {
        return `Error: "${fileId}" is a folder, not a file. You can only update file contents.`;
      }

      let content = rawContent;
      if (file.name.endsWith('.json')) {
        try {
          const trimmed = rawContent.trim();
          if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
            const parsed = JSON.parse(rawContent);
            if (typeof parsed === 'string') {
              content = parsed;
            }
          }
        } catch (e) {
          // Ignore
        }
      }

      const performUpdate = async () => {
        await convex.mutation(api.system.updateFile, {
          internalKey,
          fileId: fileId as Id<"files">,
          content,
        });

        return `File "${file.name}" updated successfully`;
      };

      try {
        if (toolStep) {
          return await toolStep.run("update-file", performUpdate);
        } else {
          return await performUpdate();
        }
      } catch (error) {
        return `Error update file: ${error instanceof Error ? error.message : "Unknown error"}`;
      }
    }
  });
};