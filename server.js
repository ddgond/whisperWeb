const Bun = require("bun");
const { Hono } = require("hono");
const { serveStatic } = require("hono/bun");
const path = require("path");
import prettyMilliseconds from "pretty-ms";

const port = Bun.env.PORT || 3000;
const uploadDir = "uploads";

const uploads = [];
const queued = [];
const inProgress = [];
const transcripts = [];

const transcribe = async (fileName) => {
	console.log("Starting transcription", fileName);
	const startTime = Date.now();
	if (process.platform === "darwin") {
		// Needed for whisperx on macOS
		await Bun.$`${Bun.env.WHISPERX_PATH} --model large-v3 --compute_type int8 ${fileName}`
			.cwd("uploads")
			.quiet();
	} else {
		await Bun.$`${Bun.env.WHISPERX_PATH} --model large-v3 ${fileName}`
			.cwd("uploads")
			.quiet();
	}
	const endTime = Date.now();
	console.log("Completed transcription", fileName);

	let textFileName;
	if (fileName.includes(".")) {
		textFileName = fileName.split(".").slice(0, -1).join(".") + ".txt";
	} else {
		textFileName = fileName + ".txt";
	}

	const textFilePath = path.join(uploadDir, textFileName);
	const transcriptContent = await Bun.file(textFilePath).text();

	inProgress.splice(inProgress.indexOf(fileName), 1);
	transcripts.push({
		fileName,
		textFileName,
		transcript: transcriptContent,
		runtime: prettyMilliseconds(endTime - startTime),
	});
};

const processQueue = async () => {
	if (queued.length > 0 && inProgress.length === 0) {
		const fileName = queued.shift();
		inProgress.push(fileName);
		transcribe(fileName);
	}
};

const app = new Hono();

app.use("/*", serveStatic({ root: "./public" }));

app.post("/api/upload", async (c) => {
	const body = await c.req.parseBody();
	const file = body["file"];

	if (!file) {
		return c.json({ error: "No file uploaded" }, 400);
	}

	uploads.push(file.name);

	const filePath = path.join(uploadDir, file.name);
	await Bun.write(filePath, file);
	console.log("Received file", file.name);

	uploads.splice(uploads.indexOf(file.name), 1);
	queued.push(file.name);

	processQueue();

	return c.json({ success: true });
});

app.get("/api/status", (c) => {
	return c.json({
		queued,
		inProgress,
		transcripts,
	});
});

app.get("/api/transcripts/:textFileName", (c) => {
	const textFileName = c.req.param("textFileName");
	const entry = transcripts.find((t) => t.textFileName === textFileName);

	if (!entry) {
		return c.json({ error: "Transcript not found" }, 404);
	}

	return c.text(entry.transcript);
});

app.onError((err, c) => {
	console.error(err);
	return c.json({ error: "Internal Server Error" }, 500);
});

setInterval(processQueue, 1000);

console.log(`Server running on port ${port}`);

export default {
	port,
	fetch: app.fetch,
	maxRequestBodySize: 1024 * 1024 * 1024 // 1 GB
};
