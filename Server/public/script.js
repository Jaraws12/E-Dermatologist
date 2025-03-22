document.addEventListener("DOMContentLoaded", () => {
    const video = document.getElementById("video");
    const canvas = document.getElementById("canvas");
    const captureButton = document.getElementById("capture");
    const fileInput = document.getElementById("fileInput");

    let stream = null; // Store the video stream

    // Start video stream
    async function startCamera() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
            video.srcObject = stream;
        } catch (err) {
            console.error("Camera access error:", err);
        }
    }

    startCamera(); // Start camera on page load

    // Function to stop camera
    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }
    }

    // Function to capture an image from video
    captureButton.addEventListener("click", async () => {
        const context = canvas.getContext("2d");
    
        // Set canvas dimensions dynamically to match the video feed resolution
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    
        // Draw the video frame onto the canvas without stretching
        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
    
        // Ensure canvas displays the correct aspect ratio
    
        canvas.toBlob(async (blob) => {
            if (!blob) {
                console.error("Failed to capture image as Blob");
                return;
            }
    
            const formData = new FormData();
            formData.append("image", blob, "photo.jpg");
    
            await uploadImage(formData);
    
            // Stop camera after capture
        }, "image/jpeg");
    });
    // Handle file selection
    fileInput.addEventListener("change", async (event) => {
        const file = event.target.files[0];
        if (!file) {
            console.error("No file selected");
            return;
        }

        const formData = new FormData();
        formData.append("image", file, file.name);

        await uploadImage(formData);

        // Stop camera and display uploaded image
        const imageUrl = URL.createObjectURL(file);
        displayImageOnCanvas(imageUrl);
    });

    // Function to display uploaded image properly
    function displayImageOnCanvas(imageSrc) {
        const ctx = canvas.getContext("2d");
        const img = new Image();
        img.onload = () => {
            // Set canvas size to match uploaded image size
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = imageSrc;
    }

    // Upload function
    async function uploadImage(formData) {
        console.log("Uploading image...", formData.get("image"));

        try {
            const response = await fetch("/upload", {
                method: "POST",
                body: formData,
            });

            const data = await response.json();
            console.log("Server Response:", data);

            if (data.success) {
                window.location.href = data.pdfUrl;
            } else {
                console.error("Error:", data.message);
            }
        } catch (error) {
            console.error("Error uploading image:", error);
        }
    }
});
