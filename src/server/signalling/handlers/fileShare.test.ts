import fs from "node:fs"
import http from "node:http"
import type { AddressInfo } from "node:net"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "rein-upload-"))

vi.mock("../../../utils/configHelper.ts", () => ({
	getUploadDir: () => uploadDir,
}))
vi.mock("../../../utils/logger.ts", () => ({
	default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

const { handleFileUpload } = await import("./fileShare.ts")

let server: http.Server
let baseUrl: string

beforeAll(async () => {
	server = http.createServer((req, res) => {
		void handleFileUpload(req, res, "host")
	})
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
	baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
	await new Promise((resolve) => server.close(resolve))
	fs.rmSync(uploadDir, { recursive: true, force: true })
})

async function upload(name: string, content: string) {
	const form = new FormData()
	form.append("file", new Blob([content]), name)
	const res = await fetch(`${baseUrl}/api/files/upload`, {
		method: "POST",
		body: form,
	})
	return (await res.json()) as { ok: boolean; path: string }
}

describe("handleFileUpload", () => {
	it.each(["résumé.pdf", "照片.jpg", "notes 📝.txt"])(
		"keeps the non-ASCII file name %s",
		async (name) => {
			const result = await upload(name, "hello")

			expect(result.ok).toBe(true)
			expect(path.basename(result.path)).toBe(name)
			expect(fs.readFileSync(path.join(uploadDir, name), "utf8")).toBe("hello")
		},
	)
})
