import cv2
# import mediapipe as mp
import numpy as np

class Image_preprocess:
    def __init__(self, cascade_path="haarcascade_frontalface_default.xml", scale_factor=1.1, min_neighbors=5,
                 expand_ratio=0.3, threshold=30):
        self.face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + cascade_path)
        self.scale_factor = scale_factor
        self.min_neighbors = min_neighbors
        self.expand_ratio = expand_ratio
        self.threshold = threshold

    def detect_faces(self, image_path):
        image = cv2.imread(image_path)
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        faces = self.face_cascade.detectMultiScale(
            gray, scaleFactor=self.scale_factor, minNeighbors=self.min_neighbors, minSize=(30, 30)
        )
        return image, faces 
    def crop_faces(self, image_path, save_faces=False):
        image, faces = self.detect_faces(image_path)
        height, width, _ = image.shape
        cropped_faces = []

        for i, (x, y, w, h) in enumerate(faces):
            # Expand the bounding box
            expand_w = int(w * self.expand_ratio)
            expand_h = int(h * self.expand_ratio)

            new_x = max(x - expand_w, 0)
            new_y = max(y - int(expand_h * 1.5), 0)  # More expansion upwards for forehead
            new_w = min(x + w + expand_w, width) - new_x
            new_h = min(y + h + expand_h, height) - new_y

            face = image[new_y:new_y + new_h, new_x:new_x + new_w]  # Crop expanded face region
            cropped_faces.append(face)

            if save_faces:
                cv2.imwrite(f"face_{i}.jpg", face)  # Save cropped face
        return cropped_faces

    def analyze_lighting(self, image_path):
        """ Detects if lighting is uneven based on brightness variations. """
        image = cv2.imread(image_path)
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # Split into 4 regions (top-left, top-right, bottom-left, bottom-right)
        h, w = gray.shape
        regions = {
                "top_left": gray[:h // 2, :w // 2],
                "top_right": gray[:h // 2, w // 2:],
                "bottom_left": gray[h // 2:, :w // 2],
                "bottom_right": gray[h // 2:, w // 2:]
            }

        brightness_values = {key: np.mean(region) for key, region in regions.items()}

        max_brightness = max(brightness_values.values())
        min_brightness = min(brightness_values.values())
        brightness_diff = max_brightness - min_brightness
        lighting_status = "Uneven" if brightness_diff > self.threshold else "Even"
        if lighting_status == 'Even':
            pass
        else:
            return 0






