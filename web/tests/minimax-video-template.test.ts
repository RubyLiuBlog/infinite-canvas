import { afterAll, expect, test } from "bun:test";

// The i18n and config modules read localStorage during initialization.
const values = new Map<string, string>();
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
    },
});
afterAll(() => {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
});

const { getPluginTemplates } = await import("../src/services/api/model-plugin");

const minimaxTemplate = getPluginTemplates().video.find((template) => template.script.includes("/query/video_generation/"));

function runTemplate(script: string, input: Record<string, unknown>) {
    const runner = new Function(
        "prompt",
        "images",
        "videos",
        "audios",
        "params",
        "model",
        "baseUrl",
        "apiKey",
        "request",
        "poll",
        `"use strict"; return (async () => {\n${script}\n})();`,
    ) as (...args: unknown[]) => Promise<{ url: string }>;
    return runner(input.prompt, input.images, input.videos, input.audios, input.params, input.model, input.baseUrl, input.apiKey, input.request, input.poll);
}

function createMocks() {
    const calls: Array<{ method: string; url: string; headers?: Record<string, string>; data?: unknown }> = [];
    const request = async (config: { method: string; url: string; headers?: Record<string, string>; data?: unknown }) => {
        calls.push(config);
        if (config.method === "post") return { task_id: "task-1" };
        return { task: { status: "succeeded", content: { url: "https://cdn.example.com/out.mp4" } } };
    };
    const poll = async (requestOnce: () => Promise<unknown>, extract: (value: unknown) => unknown) => {
        const result = extract(await requestOnce());
        if (result !== null && result !== undefined && result !== false) return result;
        throw new Error("poll did not finish");
    };
    return { calls, request, poll };
}

test("sends MiniMax native reference images and reads the task result", async () => {
    expect(minimaxTemplate).toBeDefined();
    const { calls, request, poll } = createMocks();
    const result = await runTemplate(minimaxTemplate!.script, {
        prompt: "test prompt",
        images: ["data:image/png;base64,AAA", "data:image/png;base64,BBB", "data:image/png;base64,CCC"],
        videos: [],
        audios: [],
        params: { mode: "reference", seconds: 6, size: "1280x720", ratio: "16:9", resolution: "720p" },
        model: "MiniMax-H3",
        baseUrl: "https://metaso.cn/api/minimax/v2/video_generation",
        apiKey: "test-key",
        request,
        poll,
    });

    expect(result).toEqual({ url: "https://cdn.example.com/out.mp4" });
    const post = calls.find((call) => call.method === "post");
    expect(post?.url).toBe("https://metaso.cn/api/minimax/v2/video_generation");
    expect(post?.headers?.Authorization).toBe("Bearer test-key");
    expect(post?.data).toEqual({
        model: "MiniMax-H3",
        content: [
            { type: "text", text: "test prompt" },
            { type: "image_url", image_url: { url: "data:image/png;base64,AAA" }, role: "reference_image" },
            { type: "image_url", image_url: { url: "data:image/png;base64,BBB" }, role: "reference_image" },
            { type: "image_url", image_url: { url: "data:image/png;base64,CCC" }, role: "reference_image" },
        ],
        resolution: "768P",
        duration: 6,
        ratio: "16:9",
    });
    const get = calls.find((call) => call.method === "get");
    expect(get?.url).toBe("https://metaso.cn/api/minimax/v2/query/video_generation/task-1");
});

test("uses first_frame and last_frame in frames mode", async () => {
    const { calls, request, poll } = createMocks();
    await runTemplate(minimaxTemplate!.script, {
        prompt: "frames",
        images: ["data:image/png;base64,FIRST", "data:image/png;base64,LAST"],
        videos: [],
        audios: [],
        params: { mode: "frames", seconds: 8, size: "1280x720", ratio: "16:9", resolution: "1080p" },
        model: "MiniMax-H3",
        baseUrl: "https://metaso.cn/api/minimax/v2",
        apiKey: "test-key",
        request,
        poll,
    });

    const post = calls.find((call) => call.method === "post");
    expect((post?.data as { content: unknown[] }).content).toEqual([
        { type: "text", text: "frames" },
        { type: "image_url", image_url: { url: "data:image/png;base64,FIRST" }, role: "first_frame" },
        { type: "image_url", image_url: { url: "data:image/png;base64,LAST" }, role: "last_frame" },
    ]);
});

test("maps 1080p to 2K, auto size to adaptive, and keeps 30 seconds", async () => {
    const { calls, request, poll } = createMocks();
    await runTemplate(minimaxTemplate!.script, {
        prompt: "auto",
        images: [],
        videos: [],
        audios: [],
        params: { mode: "frames", seconds: 30, size: null, ratio: "16:9", resolution: "1080p" },
        model: "MiniMax-H3",
        baseUrl: "https://metaso.cn/api/minimax/v2",
        apiKey: "test-key",
        request,
        poll,
    });
    const post = calls.find((call) => call.method === "post");
    expect(post?.data).toMatchObject({ resolution: "2K", duration: 30, ratio: "adaptive" });
});

test("rejects the OpenAI-compatible Base URL", async () => {
    const { request, poll } = createMocks();
    await expect(
        runTemplate(minimaxTemplate!.script, {
            prompt: "test",
            images: [],
            videos: [],
            audios: [],
            params: { mode: "frames", seconds: 6, size: "1280x720", ratio: "16:9", resolution: "720p" },
            model: "MiniMax-H3",
            baseUrl: "https://metaso.cn/api/openai",
            apiKey: "test-key",
            request,
            poll,
        }),
    ).rejects.toThrow("Base URL");
});
