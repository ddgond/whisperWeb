document.addEventListener("DOMContentLoaded", () => {
	const uploadForm = document.getElementById("uploadForm");
	const dropZone = document.querySelector(".drop-zone");
	const fileInput = document.getElementById("fileInput");
	const dropMessage = document.querySelector(".drop-message");
	const selectedFileText = document.querySelector(".selected-file");

	function updateSelectedFile(file) {
		if (file) {
			selectedFileText.textContent = `Selected file: ${file.name}`;
			selectedFileText.style.display = "block";
			dropZone.classList.add("has-file");
		} else {
			selectedFileText.style.display = "none";
			dropZone.classList.remove("has-file");
		}
	}

	function updateStatus() {
		fetch("/api/status")
			.then((response) => response.json())
			.then((data) => {
				document.getElementById("queueList").innerHTML = data.queued
					.map((file) => `<li>${file}</li>`)
					.join("");

				document.getElementById("progressList").innerHTML = data.inProgress
					.map((file) => `<li>${file}</li>`)
					.join("");

				document.getElementById("transcriptList").innerHTML = data.transcripts
					.map(
						(t) => `<li class="transcript-item">
<a href="/api/transcripts/${t.textFileName}" download>${t.textFileName}</a>
<span class="runtime">${t.runtime}</span>
</li>`,
					)
					.join("");
			});
	}

	// File input change handler
	fileInput.addEventListener("change", (e) => {
		const file = e.target.files[0];
		updateSelectedFile(file);
	});

	// Drag and drop handlers
	dropZone.addEventListener("dragover", (e) => {
		e.preventDefault();
		dropZone.classList.add("dragover");
	});

	dropZone.addEventListener("dragleave", () => {
		dropZone.classList.remove("dragover");
	});

	dropZone.addEventListener("drop", (e) => {
		e.preventDefault();
		dropZone.classList.remove("dragover");
		fileInput.files = e.dataTransfer.files;
		const file = e.dataTransfer.files[0];
		updateSelectedFile(file);
	});

	// Form submission
	uploadForm.addEventListener("submit", async (e) => {
		e.preventDefault();
		const formData = new FormData(uploadForm);

		try {
			const response = await fetch("/api/upload", {
				method: "POST",
				body: formData,
			});

			if (!response.ok) throw new Error("Upload failed");

			uploadForm.reset();
			updateSelectedFile(null);
			updateStatus();
		} catch (error) {
			console.error("Error:", error);
			alert("Upload failed. Please try again.");
		}
	});

	// Update status periodically
	updateStatus();
	setInterval(updateStatus, 2000);
});
