import axios from "axios";

import i18n from "@/i18n";

const apiText = (key: string, options?: Record<string, unknown>) => i18n.t(`apiErrors.${key}`, options);

/** Status text that adds nothing over the HTTP status itself. */
const GENERIC_HTTP_MESSAGE = /^(bad request|unauthorized|forbidden|not found|404 not found|404 page not found|the requested url was not found on this server|method not allowed|route not found|cannot (get|post|put|patch|delete) \S+|request timeout|conflict|internal server error|not implemented|bad gateway|service unavailable|gateway timeout)\.?$/i;
const UNSUPPORTED_SIZE_MESSAGE = /unsupported value for ['"]?size['"]?/i;

export function readApiErrorMessage(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") {
        // The value may be serialized JSON, such as error.message, or a plain-text error.
        try {
            const parsed = JSON.parse(value);
            const inner = readApiErrorMessage(parsed) || value;
            // Treat an empty parsed object such as "{}" as having no useful message.
            if (inner === value && typeof parsed === "object" && Object.keys(parsed).length === 0) return "";
            return inner;
        } catch {
            // Detect HTML error pages.
            if (/<[a-z][\s\S]*>/i.test(value)) return apiText("htmlError", { preview: `${value.slice(0, 80)}...` });
            return value;
        }
    }
    if (typeof value !== "object") return "";
    const payload = value as { msg?: unknown; message?: unknown; error?: unknown; detail?: unknown };
    // error may be a string or an object containing a message.
    const errorMsg =
        typeof payload.error === "string"
            ? payload.error
            : (payload.error as { message?: unknown })?.message;
    return (
        readApiErrorMessage(payload.msg) ||
        readApiErrorMessage(payload.message) ||
        readApiErrorMessage(errorMsg) ||
        readApiErrorMessage(payload.detail) ||
        ""
    );
}

export function isGenericHttpMessage(message: string) {
    return GENERIC_HTTP_MESSAGE.test(message.trim());
}

/** Show the failing endpoint without query/hash or credentials, and unwrap the local proxy prefix. */
export function readRequestUrl(url?: string) {
    let value = (url || "").replace(/[?#].*$/, "").trim();
    for (let depth = 0; depth < 3; depth += 1) {
        const proxied = value.match(/^https?:\/\/[^/]+\/(https?:\/\/.+)$/i);
        if (!proxied) break;
        try {
            value = decodeURI(proxied[1]).replace(/[?#].*$/, "").trim();
        } catch {
            break;
        }
    }
    return value.replace(/^(https?:\/\/)[^/@]+@/i, "$1");
}

export function readStatusError(status: number | undefined, fallback: string, url?: string) {
    if (status === 401 || status === 403) return apiText("authenticationFailed");
    if (status === 429) return apiText("rateLimited");
    if (status === 404) {
        const requestUrl = readRequestUrl(url);
        return requestUrl ? apiText("notFoundWithUrl", { url: requestUrl }) : apiText("notFound");
    }
    if (status === 502) return apiText("badGateway");
    if (status === 503) return apiText("serviceBusy");
    return status ? apiText("httpFailed", { status }) : fallback;
}

export function readAxiosError(error: unknown, fallback: string, options?: { timeout?: boolean }) {
    if (axios.isCancel(error)) return apiText("requestCanceled");
    if (axios.isAxiosError(error)) {
        if (options?.timeout && (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT")) return apiText("imageTimeout");
        if (!error.response && error.code === "ERR_NETWORK") return apiText("networkUnreachable");
        const status = error.response?.status;
        const detail = readApiErrorMessage(error.response?.data);
        const usableDetail = detail && !isGenericHttpMessage(detail) ? detail : "";
        if (status === 404) {
            const requestUrl = readRequestUrl(error.config?.url);
            if (requestUrl && usableDetail) return apiText("notFoundDetail", { url: requestUrl, detail: usableDetail });
            if (requestUrl) return apiText("notFoundWithUrl", { url: requestUrl });
            return usableDetail || apiText("notFound");
        }
        if (usableDetail && UNSUPPORTED_SIZE_MESSAGE.test(usableDetail)) return apiText("videoSizeUnsupported", { detail: usableDetail });
        if (usableDetail) return usableDetail;
        return readStatusError(status, fallback);
    }
    if (error instanceof DOMException && error.name === "AbortError") return apiText("requestCanceled");
    return error instanceof Error ? readApiErrorMessage(error.message) || error.message : fallback;
}
