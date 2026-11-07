import { afterAll, expect, test } from "bun:test";

// The i18n module reads localStorage during initialization.
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

const { isGenericHttpMessage, readAxiosError, readRequestUrl, readStatusError } = await import("../src/services/api/api-error");

function axiosError(status: number, data: unknown, url: string) {
    return {
        isAxiosError: true,
        code: "ERR_BAD_REQUEST",
        config: { url },
        response: { status, statusText: "", headers: {}, config: { url }, data },
    };
}

test("maps a generic 404 body to the endpoint message with the request URL", () => {
    const message = readAxiosError(axiosError(404, { error: "Not Found" }, "https://metaso.cn/api/minimax/v2/video_generation/v1/videos"), "fallback");
    expect(message).toContain("404");
    expect(message).toContain("https://metaso.cn/api/minimax/v2/video_generation/v1/videos");
    expect(message).not.toContain("Not Found");
});

test("keeps a useful 404 body message after the endpoint hint", () => {
    const message = readAxiosError(axiosError(404, { error: { message: "Invalid URL (POST /v1/videos)" } }, "https://example.com/v1/videos"), "fallback");
    expect(message).toContain("https://example.com/v1/videos");
    expect(message).toContain("Invalid URL (POST /v1/videos)");
});

test("falls back to the HTTP status for a generic server error body", () => {
    const message = readAxiosError(axiosError(500, "Internal Server Error", "https://example.com/v1/images/generations"), "fallback");
    expect(message).toContain("500");
    expect(message).not.toContain("Internal Server Error");
});

test("prefers a specific authentication error over the status text", () => {
    const message = readAxiosError(axiosError(401, { error: { message: "Incorrect API key provided" } }, "https://example.com/v1/videos"), "fallback");
    expect(message).toBe("Incorrect API key provided");
});

test("turns an unsupported video size response into an actionable hint", () => {
    const message = readAxiosError(axiosError(400, { error: { message: "Unsupported value for 'size'" } }, "https://metaso.cn/api/openai/v1/videos"), "fallback");
    expect(message).toContain("720p");
    expect(message).toContain("16:9");
    expect(message).toContain("Unsupported value for 'size'");
});

test("uses the authentication hint for a generic 401 body", () => {
    const message = readAxiosError(axiosError(401, "Unauthorized", "https://example.com/v1/videos"), "fallback");
    expect(message).not.toContain("Unauthorized");
    expect(message).toContain("鉴权失败");
});

test("shows the request URL for 404 but not for other statuses", () => {
    expect(readStatusError(404, "fallback", "https://example.com/v1/videos")).toContain("https://example.com/v1/videos");
    expect(readStatusError(404, "fallback")).not.toContain("https://example.com");
});

test("strips query, hash, credentials and the local proxy prefix from the displayed URL", () => {
    expect(readRequestUrl("http://127.0.0.1:23210/https://metaso.cn/api/openai/v1/videos?key=secret#hash")).toBe("https://metaso.cn/api/openai/v1/videos");
    expect(readRequestUrl("https://user:pass@example.com/v1/videos?token=secret")).toBe("https://example.com/v1/videos");
});

test("recognizes generic HTTP status text but not model or endpoint details", () => {
    expect(isGenericHttpMessage("Not Found")).toBe(true);
    expect(isGenericHttpMessage("Cannot GET /v1/videos")).toBe(true);
    expect(isGenericHttpMessage("Model not found")).toBe(false);
    expect(isGenericHttpMessage("Invalid URL (POST /v1/videos)")).toBe(false);
});
