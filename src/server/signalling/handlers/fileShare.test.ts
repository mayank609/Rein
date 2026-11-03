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

	it("does not overwrite an existing file with the same name", async () => {
		const first = await upload("image.jpg", "first")
		const second = await upload("image.jpg", "second")

		expect(path.basename(first.path)).toBe("image.jpg")
		expect(path.basename(second.path)).toBe("image (1).jpg")
		expect(fs.readFileSync(first.path, "utf8")).toBe("first")
		expect(fs.readFileSync(second.path, "utf8")).toBe("second")
	})

	it("keeps every file when same-name uploads arrive at once", async () => {
		const results = await Promise.all(
			["a", "b", "c"].map((content) => upload("clip.mp4", content)),
		)

		const names = results.map((r) => path.basename(r.path)).sort()
		expect(names).toEqual(["clip (1).mp4", "clip (2).mp4", "clip.mp4"])
		const contents = results.map((r) => fs.readFileSync(r.path, "utf8")).sort()
		expect(contents).toEqual(["a", "b", "c"])
	})
})
