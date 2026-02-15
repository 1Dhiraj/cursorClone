import { z } from "zod";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

import { convex } from "@/lib/convex-client";
import { inngest } from "@/inngest/client";

import { api } from "../../../../../convex/_generated/api";

const requestSchema = z.object({
  url: z.string().url(),
});

function parseGitHubUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname !== "github.com") {
      throw new Error("Invalid GitHub URL");
    }

    const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
    if (pathParts.length < 2) {
      throw new Error("Invalid GitHub URL");
    }

    return { owner: pathParts[0], repo: pathParts[1].replace(/\.git$/, "") };
  } catch (e) {
     throw new Error("Invalid GitHub URL");
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const result = requestSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid URL provided" },
        { status: 400 }
      );
    }

    const { url } = result.data;
    let owner, repo;

    try {
      ({ owner, repo } = parseGitHubUrl(url));
    } catch {
       return NextResponse.json(
        { error: "Invalid GitHub URL format" },
        { status: 400 }
      );
    }
  
    const client = await clerkClient();
    const tokens = await client.users.getUserOauthAccessToken(
      userId,
      "github"
    );
    const githubToken = tokens.data[0]?.token;

    if (!githubToken) {
      return NextResponse.json(
        { error: "GitHub not connected. Please reconnect your GitHub account." },
        { status: 400 }
      );
    }

    const internalKey = process.env.POLARIS_CONVEX_INTERNAL_KEY;

    if (!internalKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const projectId = await convex.mutation(api.system.createProject, {
      internalKey,
      name: repo,
      ownerId: userId,
    });

    const event = await inngest.send({
      name: "github/import.repo",
      data: {
        owner,
        repo,
        projectId,
        githubToken,
      },
    });

    return NextResponse.json({ 
      success: true, 
      projectId, 
      eventId: event.ids[0]
    });
  } catch (error) {
    console.error("[GITHUB_IMPORT_ERROR]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
};