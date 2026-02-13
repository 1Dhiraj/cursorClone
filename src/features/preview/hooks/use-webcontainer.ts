import { useCallback, useEffect, useRef, useState } from "react";
import { WebContainer } from "@webcontainer/api";

import {
    buildFileTree,
    getFilePath
} from "@/features/preview/utils/file-tree";
import { useFiles } from "@/features/projects/hooks/use-files";

import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

// Singleton WebContainer instance
let webcontainerInstance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;

const getWebContainer = async (): Promise<WebContainer> => {
    if (webcontainerInstance) {
        return webcontainerInstance;
    }

    if (!bootPromise) {
        bootPromise = WebContainer.boot({ coep: "credentialless" });
    }

    webcontainerInstance = await bootPromise;
    return webcontainerInstance;
};

const teardownWebContainer = () => {
    if (webcontainerInstance) {
        webcontainerInstance.teardown();
        webcontainerInstance = null;
    }
    bootPromise = null;
};

interface UseWebContainerProps {
    projectId: Id<"projects">;
    enabled: boolean;
    settings?: {
        installCommand?: string;
        devCommand?: string;
    };
};

export const useWebContainer = ({
    projectId,
    enabled,
    settings,
}: UseWebContainerProps) => {
    const [status, setStatus] = useState<
        "idle" | "booting" | "installing" | "running" | "error"
    >("idle");
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [restartKey, setRestartKey] = useState(0);
    const [terminalOutput, setTerminalOutput] = useState("");

    const containerRef = useRef<WebContainer | null>(null);
    const hasStartedRef = useRef(false);

    // Fetch files from Convex (auto-updates on changes)
    const files = useFiles(projectId);

    // Initial boot and mount
    useEffect(() => {
        if (!enabled || !files || files.length === 0 || hasStartedRef.current) {
            return;
        }

        hasStartedRef.current = true;

        const start = async () => {
            try {
                setStatus("booting");
                setError(null);
                setTerminalOutput("");

                const appendOutput = (data: string) => {
                    setTerminalOutput((prev) => prev + data);
                };

                appendOutput("[System] Booting WebContainer...\n");
                const container = await getWebContainer();
                containerRef.current = container;

                appendOutput("[System] Mounting files...\n");
                const fileTree = buildFileTree(files);
                await container.mount(fileTree);

                appendOutput("[System] Spawning shell...\n");
                const shellProcess = await container.spawn("jsh", {
                    terminal: {
                        cols: 80,
                        rows: 24,
                    },
                });

                shellProcess.output.pipeTo(
                    new WritableStream({
                        write(data) {
                            appendOutput(data);
                        },
                    })
                );

                const inputWriter = shellProcess.input.getWriter();

                // Store writer in a ref to expose it
                (containerRef.current as any).inputWriter = inputWriter;

                container.on("server-ready", (_port, url) => {
                    appendOutput("\n[System] Server ready! Url: " + url + "\n");
                    setPreviewUrl(url);
                    setStatus("running");
                });

                setStatus("installing");

                const installCmd = settings?.installCommand || "npm install --no-audit --no-fund --legacy-peer-deps";
                const devCmd = settings?.devCommand || "npm run dev";

                // Auto-run commands in the shell
                appendOutput(`[System] Auto-running: ${installCmd} && ${devCmd}\n`);

                await inputWriter.write(`${installCmd} && ${devCmd}\n`);

            } catch (error) {
                setError(error instanceof Error ? error.message : "Unknown error");
                setStatus("error");
            }
        };

        start();
    }, [
        enabled,
        files,
        restartKey,
        settings?.devCommand,
        settings?.installCommand,
    ]);

    // Sync file changes (hot-reload)
    useEffect(() => {
        const container = containerRef.current;
        if (!container || !files || status !== "running") return;

        const filesMap = new Map(files.map((f) => [f._id, f]));

        for (const file of files) {
            if (file.type !== "file" || file.storageId || !file.content) continue;

            const filePath = getFilePath(file, filesMap);
            container.fs.writeFile(filePath, file.content);
        }
    }, [files, status]);

    // Reset when disabled
    useEffect(() => {
        if (!enabled) {
            hasStartedRef.current = false;
            setStatus("idle");
            setPreviewUrl(null);
            setError(null);
        }
    }, [enabled]);

    // Restart the entire WebContainer process
    const restart = useCallback(() => {
        teardownWebContainer();
        containerRef.current = null;
        hasStartedRef.current = false;
        setStatus("idle");
        setPreviewUrl(null);
        setError(null);
        setRestartKey((k) => k + 1);
    }, []);

    const writeToProcess = useCallback((data: string) => {
        const writer = (containerRef.current as any)?.inputWriter;
        if (writer) {
            writer.write(data);
        }
    }, []);

    return {
        status,
        previewUrl,
        error,
        restart,
        terminalOutput,
        writeToProcess,
    };
};