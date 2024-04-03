const Bun = require('bun');
const { Hono } = require('hono');
const { serveStatic } = require('hono/bun');
const path = require('path');

const port = Bun.env.PORT || 3000;
const uploadDir = 'uploads';

const uploads = [];
const queued = [];
const inProgress = [];
const transcripts = [];

const transcribe = async fileName => {
  console.log('Starting transcription', fileName);
  if (process.platform === 'darwin') { // Needed for whisperx on macOS
    await Bun.$`${Bun.env.WHISPERX_PATH} --model large-v3 --compute_type int8 ${fileName}`.cwd('uploads').quiet(); 
  } else {
    await Bun.$`${Bun.env.WHISPERX_PATH} --model large-v3 ${fileName}`.cwd('uploads').quiet();
  }
  console.log('Completed transcription', fileName);

  let textFileName;
  if (fileName.includes('.')) {
    textFileName = fileName.split('.').slice(0, -1).join('.') + '.txt';
  } else {
    textFileName = fileName + '.txt';
  }

  const textFilePath = path.join(uploadDir, textFileName);
  const transcriptContent = await Bun.file(textFilePath).text();

  inProgress.splice(inProgress.indexOf(fileName), 1);
  transcripts.push({ fileName, textFileName, transcript: transcriptContent});
}

const processQueue = async () => {
  if (queued.length > 0 && inProgress.length === 0) {
    const fileName = queued.shift();
    inProgress.push(fileName);
    transcribe(fileName);
  }
};



const app = new Hono();

app.get('/', c => {
  const html = `
    <html>
      <head>
        <title>WhisperX</title>
      </head>
      <body>
        <h1>WhisperX</h1>
        <h2>Upload File</h2>
        <form action="/upload" method="post" enctype="multipart/form-data">
          <input type="file" name="file"/>
          <button type="submit">Upload</button>
        </form>
        <a href="/">
          <button>Refresh</button>
        </a>
        <h2>In Progress</h2>
        <ul>
          ${inProgress.map(fileName => `<li>${fileName}</li>`).join('')}
        </ul>
        <h2>Current Transcripts</h2>
        <ul>
          ${transcripts.map(t => `<li><a href="/transcripts/${t.textFileName}" download>${t.textFileName}</a></li>`).join('')}
        </ul>
      </body>
    </html>
  `;
  return c.html(html);
});

app.post('/upload', async c => {
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file) {
    return c.text('No file uploaded', 400);
  }

  uploads.push(file.name);
  
  const filePath = path.join(uploadDir, file.name);
  await Bun.write(filePath, file);
  console.log('Received file', file.name);
  
  uploads.splice(uploads.indexOf(file.name), 1);
  queued.push(file.name);

  processQueue();

  return c.redirect('/');
});

app.get('/transcripts', c => {
  return c.json(transcripts);
});

app.get('/transcripts/:textFileName', c => {
  const textFileName = c.req.param('textFileName');
  const entry = transcripts.find(t => t.textFileName === textFileName);

  if (!entry) {
    return c.text('Transcript not found', 404);
  }

  return c.text(entry.transcript);
});

app.onError((err, c) => {
  return c.text('Internal Server Error', 500);
});



setInterval(processQueue, 1000);

console.log(`Server running on port ${port}`);

export default {
  port,
  fetch: app.fetch
}
